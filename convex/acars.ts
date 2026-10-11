import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, requireAdmin, requireSystem } from "./lib/auth";
import { assertModerationTarget, moderationLabel } from "./lib/moderationRules";

const MAX_MESSAGES = 20;
const POST_COOLDOWN_MS = 30_000;
const REGISTRATION_WINDOW_MS = 60 * 60_000;
const REGISTRATION_LIMIT = 8;

function validGoogleId(value: string) {
  return /^\d{8,32}$/.test(value);
}

function validSessionId(value: string) {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
}

async function currentFlight(ctx: QueryCtx | MutationCtx, googleId: string) {
  return await ctx.db
    .query("acarsFlightSessions")
    .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
    .first();
}

export const setFlightSession = mutation({
  args: {
    googleId: v.string(),
    tokenHash: v.string(),
    sessionId: v.string(),
    active: v.boolean(),
    systemSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    await postingPilot(ctx, args.tokenHash, args.googleId);
    if (!validSessionId(args.sessionId))
      throw new Error("Invalid ACARS flight session");
    const current = await currentFlight(ctx, args.googleId);
    if (!args.active) {
      if (current?.sessionId === args.sessionId)
        await ctx.db.patch(current._id, {
          active: false,
          updatedAt: Date.now(),
        });
      return;
    }
    if (current)
      await ctx.db.patch(current._id, {
        sessionId: args.sessionId,
        active: true,
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("acarsFlightSessions", {
        googleId: args.googleId,
        sessionId: args.sessionId,
        active: true,
        updatedAt: Date.now(),
      });
  },
});

async function postingPilot(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
  googleId: string,
) {
  if (!validGoogleId(googleId))
    throw new Error("Sign in to GeoFS to publish ACARS");
  const device = await ctx.db
    .query("acarsDevices")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (device?.googleId !== googleId)
    throw new Error("ACARS device is not registered");
  const user = await ctx.db
    .query("users")
    .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
    .first();
  if (!user) throw new Error("Link a RadarThing account to publish ACARS");
  if (user.isDeleted || user.activeBanId)
    throw new Error("Account access restricted");
  return user;
}

async function moderationPilot(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users"> | undefined,
  googleId: string,
) {
  return (
    (userId ? await ctx.db.get(userId) : null) ??
    (await ctx.db
      .query("users")
      .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
      .first())
  );
}

async function lastPostingAttempt(
  ctx: QueryCtx | MutationCtx,
  googleId: string,
  includeReservation = true,
) {
  const [latest, blocked, reservation] = await Promise.all([
    ctx.db
      .query("acarsMessages")
      .withIndex("by_googleId_createdAt", (q) => q.eq("googleId", googleId))
      .order("desc")
      .first(),
    ctx.db
      .query("acarsModerationEvents")
      .withIndex("by_googleId_createdAt", (q) => q.eq("googleId", googleId))
      .order("desc")
      .first(),
    includeReservation
      ? ctx.db
          .query("acarsPostingReservations")
          .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
          .first()
      : Promise.resolve(null),
  ]);
  return Math.max(
    latest?.createdAt ?? 0,
    blocked?.createdAt ?? 0,
    reservation?.reservedAt ?? 0,
  );
}

async function assertPostingCooldown(ctx: MutationCtx, googleId: string) {
  const lastAttempt = await lastPostingAttempt(ctx, googleId, false);
  if (lastAttempt && Date.now() - lastAttempt < POST_COOLDOWN_MS)
    throw new Error("Wait 30 seconds before publishing another ACARS entry");
}

export const reserveRegistration = mutation({
  args: { ipHash: v.string(), systemSecret: v.string() },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    if (!/^[a-f0-9]{64}$/.test(args.ipHash))
      throw new Error("Invalid registration source");
    const now = Date.now();
    const current = await ctx.db
      .query("acarsRegistrationRates")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .first();
    if (!current) {
      await ctx.db.insert("acarsRegistrationRates", {
        ipHash: args.ipHash,
        windowStartedAt: now,
        attempts: 1,
      });
      return { allowed: true };
    }
    if (now - current.windowStartedAt >= REGISTRATION_WINDOW_MS) {
      await ctx.db.patch(current._id, { windowStartedAt: now, attempts: 1 });
      return { allowed: true };
    }
    if (current.attempts >= REGISTRATION_LIMIT)
      return {
        allowed: false,
        retryAfter: REGISTRATION_WINDOW_MS - (now - current.windowStartedAt),
      };
    await ctx.db.patch(current._id, { attempts: current.attempts + 1 });
    return { allowed: true };
  },
});

export const cleanupRegistrationRates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("acarsRegistrationRates")
      .withIndex("by_windowStartedAt", (q) =>
        q.lt("windowStartedAt", Date.now() - REGISTRATION_WINDOW_MS),
      )
      .take(500);
    for (const row of expired) await ctx.db.delete(row._id);
  },
});

export const reservePosting = mutation({
  args: {
    googleId: v.string(),
    tokenHash: v.string(),
    sessionId: v.string(),
    systemSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    try {
      await postingPilot(ctx, args.tokenHash, args.googleId);
    } catch {
      return { allowed: false, retryAfter: 0 };
    }
    const flight = await currentFlight(ctx, args.googleId);
    if (!flight?.active || flight.sessionId !== args.sessionId)
      return { allowed: false, retryAfter: 0 };
    const now = Date.now();
    const lastAttempt = await lastPostingAttempt(ctx, args.googleId);
    if (lastAttempt && now - lastAttempt < POST_COOLDOWN_MS)
      return {
        allowed: false,
        retryAfter: POST_COOLDOWN_MS - (now - lastAttempt),
      };
    const reservation = await ctx.db
      .query("acarsPostingReservations")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .first();
    if (reservation) await ctx.db.patch(reservation._id, { reservedAt: now });
    else
      await ctx.db.insert("acarsPostingReservations", {
        googleId: args.googleId,
        reservedAt: now,
      });
    return { allowed: true, retryAfter: 0 };
  },
});

export const registerDevice = mutation({
  args: {
    googleId: v.string(),
    tokenHash: v.string(),
    systemSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    if (!validGoogleId(args.googleId) || !/^[a-f0-9]{64}$/.test(args.tokenHash))
      throw new Error("Invalid ACARS device registration");
    const pilot = await ctx.db
      .query("users")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .first();
    if (!pilot) throw new Error("Link a RadarThing account to publish ACARS");
    if (pilot.isDeleted || pilot.activeBanId)
      throw new Error("Account access restricted");
    const existing = await ctx.db
      .query("acarsDevices")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (existing) {
      if (existing.googleId !== args.googleId)
        throw new Error("ACARS device belongs to another pilot");
      return;
    }
    const claimed = await ctx.db
      .query("acarsDevices")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .first();
    if (claimed)
      throw new Error("This GeoFS ID is already registered on another device");
    await ctx.db.insert("acarsDevices", {
      googleId: args.googleId,
      tokenHash: args.tokenHash,
      createdAt: Date.now(),
    });
  },
});

export const isDeviceRegistered = query({
  args: {
    googleId: v.string(),
    tokenHash: v.string(),
    systemSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    const device = await ctx.db
      .query("acarsDevices")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    return device?.googleId === args.googleId;
  },
});

export const postingStatus = query({
  args: { tokenHash: v.string(), googleId: v.string() },
  handler: async (ctx, args) => {
    try {
      await postingPilot(ctx, args.tokenHash, args.googleId);
      const lastAttempt = await lastPostingAttempt(ctx, args.googleId);
      return {
        allowed: true,
        retryAfter: lastAttempt
          ? Math.max(0, POST_COOLDOWN_MS - (Date.now() - lastAttempt))
          : 0,
      };
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : "Cannot publish",
      };
    }
  },
});

export const publish = mutation({
  args: {
    googleId: v.string(),
    tokenHash: v.string(),
    sessionId: v.string(),
    body: v.string(),
    systemSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    const user = await postingPilot(ctx, args.tokenHash, args.googleId);
    const flight = await currentFlight(ctx, args.googleId);
    if (!flight?.active || flight.sessionId !== args.sessionId)
      throw new Error("ACARS flight session is no longer active");
    const body = args.body.trim();
    if (!body || body.length > 500)
      throw new Error("ACARS text must be 1–500 characters");
    await assertPostingCooldown(ctx, args.googleId);
    const messages = await ctx.db
      .query("acarsMessages")
      .withIndex("by_googleId_createdAt", (q) =>
        q.eq("googleId", args.googleId),
      )
      .order("desc")
      .take(MAX_MESSAGES + 1);
    const oldest = messages[messages.length - 1];
    if (messages.length >= MAX_MESSAGES && oldest)
      await ctx.db.delete(oldest._id);
    return await ctx.db.insert("acarsMessages", {
      userId: user?._id,
      googleId: args.googleId,
      deviceHash: args.tokenHash,
      sessionId: args.sessionId,
      body,
      createdAt: Date.now(),
    });
  },
});

export const recordBlocked = mutation({
  args: {
    googleId: v.string(),
    tokenHash: v.string(),
    sessionId: v.string(),
    body: v.string(),
    categories: v.array(v.string()),
    systemSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    const user = await postingPilot(ctx, args.tokenHash, args.googleId);
    const flight = await currentFlight(ctx, args.googleId);
    if (!flight?.active || flight.sessionId !== args.sessionId)
      throw new Error("ACARS flight session is no longer active");
    if (!args.body.trim() || args.body.length > 500)
      throw new Error("Invalid ACARS text");
    await assertPostingCooldown(ctx, args.googleId);
    const previous = await ctx.db
      .query("acarsModerationEvents")
      .withIndex("by_googleId_createdAt", (q) =>
        q.eq("googleId", args.googleId),
      )
      .order("desc")
      .take(100);
    if (previous.length >= 100) {
      const oldest = previous[previous.length - 1];
      if (oldest) await ctx.db.delete(oldest._id);
    }
    return await ctx.db.insert("acarsModerationEvents", {
      userId: user?._id,
      googleId: args.googleId,
      body: args.body.trim(),
      categories: args.categories.slice(0, 20),
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    googleId: v.string(),
    tokenHash: v.string(),
    messageId: v.id("acarsMessages"),
    systemSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);
    await postingPilot(ctx, args.tokenHash, args.googleId);
    const message = await ctx.db.get(args.messageId);
    if (
      message?.googleId !== args.googleId ||
      message.deviceHash !== args.tokenHash
    )
      throw new Error("ACARS entry not found on this device");
    await ctx.db.delete(message._id);
  },
});

export const listPublic = query({
  args: { googleId: v.string() },
  handler: async (ctx, args) => {
    if (!validGoogleId(args.googleId)) return [];
    const viewer = await getCurrentUser(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .first();
    if (user?.isDeleted || user?.activeBanId) return [];
    const flight = await currentFlight(ctx, args.googleId);
    if (!flight?.active) return [];
    const messages = await ctx.db
      .query("acarsMessages")
      .withIndex("by_googleId_sessionId_createdAt", (q) =>
        q.eq("googleId", args.googleId).eq("sessionId", flight.sessionId),
      )
      .order("desc")
      .take(MAX_MESSAGES);
    return messages.map(({ _id, body, createdAt, userId }) => ({
      _id,
      body,
      createdAt,
      isOwnEntry: !!viewer && userId === viewer._id,
    }));
  },
});

export const listForDevice = query({
  args: { googleId: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    await postingPilot(ctx, args.tokenHash, args.googleId);
    const flight = await currentFlight(ctx, args.googleId);
    if (!flight?.active) return [];
    const messages = await ctx.db
      .query("acarsMessages")
      .withIndex("by_googleId_sessionId_createdAt", (q) =>
        q.eq("googleId", args.googleId).eq("sessionId", flight.sessionId),
      )
      .order("desc")
      .take(MAX_MESSAGES);
    return messages.map(({ _id, body, createdAt, deviceHash }) => ({
      _id,
      body,
      createdAt,
      canRemove: deviceHash === args.tokenHash,
    }));
  },
});

export const exportMessages = query({
  args: {
    source: v.union(v.literal("user"), v.literal("google")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.isDeleted) throw new Error("Account not found");
    if (args.source === "google" && !user.googleId)
      return { page: [], isDone: true, continueCursor: "" };
    const records =
      args.source === "user"
        ? ctx.db
            .query("acarsMessages")
            .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
        : ctx.db
            .query("acarsMessages")
            .withIndex("by_googleId_createdAt", (q) =>
              q.eq("googleId", user.googleId!),
            );
    const page = await records.order("desc").paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map(({ _id, googleId, body, createdAt }) => ({
        id: _id,
        googleId,
        body,
        createdAt,
      })),
    };
  },
});

export const exportBlocked = query({
  args: {
    source: v.union(v.literal("user"), v.literal("google")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.isDeleted) throw new Error("Account not found");
    if (args.source === "google" && !user.googleId)
      return { page: [], isDone: true, continueCursor: "" };
    const records =
      args.source === "user"
        ? ctx.db
            .query("acarsModerationEvents")
            .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
        : ctx.db
            .query("acarsModerationEvents")
            .withIndex("by_googleId_createdAt", (q) =>
              q.eq("googleId", user.googleId!),
            );
    const page = await records.order("desc").paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map(({ _id, googleId, body, categories, createdAt }) => ({
        id: _id,
        googleId,
        body,
        categories,
        createdAt,
      })),
    };
  },
});

export const exportReports = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.isDeleted) throw new Error("Account not found");
    const page = await ctx.db
      .query("acarsReports")
      .withIndex("by_reporter_createdAt", (q) =>
        q.eq("reporterUserId", user._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map(({ _id, googleId, body, reason, createdAt }) => ({
        id: _id,
        googleId,
        body,
        reason,
        createdAt,
      })),
    };
  },
});

export const report = mutation({
  args: { messageId: v.id("acarsMessages"), reason: v.string() },
  handler: async (ctx, args) => {
    const reporter = await getCurrentUser(ctx);
    if (!reporter || reporter.isDeleted || reporter.activeBanId)
      return { status: "sign_in_required" as const };
    const message = await ctx.db.get(args.messageId);
    if (!message) return { status: "not_found" as const };
    if (message.userId === reporter._id)
      return { status: "own_entry" as const };
    const reason = args.reason.trim();
    if (!reason || reason.length > 2000)
      return { status: "invalid_reason" as const };
    const previous = await ctx.db
      .query("acarsReports")
      .withIndex("by_message_reporter", (q) =>
        q.eq("messageId", args.messageId).eq("reporterUserId", reporter._id),
      )
      .first();
    if (previous) return { status: "already_reported" as const };
    await ctx.db.insert("acarsReports", {
      messageId: args.messageId,
      reporterUserId: reporter._id,
      pilotUserId: message.userId,
      googleId: message.googleId,
      body: message.body,
      reason,
      createdAt: Date.now(),
    });
    return { status: "reported" as const };
  },
});

export const adminReports = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db
      .query("acarsReports")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (report) => {
          const message = await ctx.db.get(report.messageId);
          const pilot = await moderationPilot(
            ctx,
            report.pilotUserId,
            report.googleId,
          );
          return {
            _id: report._id,
            messageId: report.messageId,
            body: report.body,
            reason: report.reason,
            createdAt: report.createdAt,
            reviewedAt: report.reviewedAt,
            isMessagePresent: Boolean(message),
            pilotId: pilot?._id ?? null,
            pilotLabel: pilot
              ? moderationLabel(pilot, pilot._id)
              : "Unlinked pilot",
          };
        }),
      ),
    };
  },
});

export const adminBlocked = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db
      .query("acarsModerationEvents")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (event) => {
          const pilot = await moderationPilot(
            ctx,
            event.userId,
            event.googleId,
          );
          return {
            _id: event._id,
            body: event.body,
            categories: event.categories,
            createdAt: event.createdAt,
            userId: pilot?._id ?? null,
            pilotLabel: pilot
              ? moderationLabel(pilot, pilot._id)
              : "Unlinked pilot",
          };
        }),
      ),
    };
  },
});

export const adminReleaseDevice = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const pilot = await ctx.db.get(args.userId);
    if (!pilot) throw new Error("User not found");
    assertModerationTarget(actor, pilot);
    if (!pilot.googleId)
      throw new Error("This RT account has no linked GeoFS ID");
    const devices = await ctx.db
      .query("acarsDevices")
      .withIndex("by_googleId", (q) => q.eq("googleId", pilot.googleId!))
      .collect();
    for (const device of devices) await ctx.db.delete(device._id);
    return devices.length;
  },
});

export const adminRemove = mutation({
  args: { messageId: v.id("acarsMessages") },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) return;
    const pilot = await moderationPilot(ctx, message.userId, message.googleId);
    if (pilot) assertModerationTarget(actor, pilot);
    await ctx.db.delete(message._id);
  },
});

export const markReportReviewed = mutation({
  args: { reportId: v.id("acarsReports") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const report = await ctx.db.get(args.reportId);
    if (report && !report.reviewedAt)
      await ctx.db.patch(report._id, { reviewedAt: Date.now() });
  },
});
