import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSystem } from "./lib/auth";
import { recordLiveSample } from "./lib/telemetry";

const persistedSessionValidator = v.object({
  userId: v.id("users"),
  state: v.union(v.literal("active"), v.literal("disconnected")),
  originalId: v.string(),
  session: v.any(),
  disconnectedAt: v.optional(v.number()),
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    systemSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);

    return await ctx.db
      .query("activeFlightSessions")
      .withIndex("by_updatedAt")
      .take(Math.min(Math.max(args.limit ?? 1000, 1), 5000));
  },
});

export const replaceAll = mutation({
  args: {
    sessions: v.array(persistedSessionValidator),
    systemSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);

    const now = Date.now();
    const eligible = [];
    for (const session of args.sessions) {
      const user = await ctx.db.get(session.userId);
      if (user && !user.isDeleted && !user.activeBanId) eligible.push(session);
    }
    const sessionsByUserId = new Map(
      eligible.map((session) => [session.userId, session]),
    );
    const seenUserIds = new Set(sessionsByUserId.keys());
    const existing = await ctx.db.query("activeFlightSessions").collect();
    const existingByUserId = new Map(
      existing.map((persisted) => [persisted.userId, persisted]),
    );
    let deleted = 0;

    for (const persisted of existing) {
      if (!seenUserIds.has(persisted.userId)) {
        await ctx.db.delete(persisted._id);
        existingByUserId.delete(persisted.userId);
        deleted++;
      }
    }

    for (const session of sessionsByUserId.values()) {
      const existingForUser = existingByUserId.get(session.userId);
      const value = {
        userId: session.userId,
        state: session.state,
        originalId: session.originalId,
        session: session.session,
        disconnectedAt: session.disconnectedAt,
        updatedAt: now,
      };

      if (existingForUser) {
        await ctx.db.patch(existingForUser._id, value);
        existingByUserId.set(session.userId, {
          ...existingForUser,
          ...value,
        });
      } else {
        const id = await ctx.db.insert("activeFlightSessions", value);
        existingByUserId.set(session.userId, {
          _id: id,
          _creationTime: now,
          ...value,
        });
      }
    }

    let liveFlights = 0;
    for (const session of sessionsByUserId.values()) {
      if (session.state === "active") liveFlights++;
    }
    await recordLiveSample(ctx, liveFlights, now);

    return {
      saved: sessionsByUserId.size,
      deleted,
    };
  },
});

export const clear = mutation({
  args: {
    userIds: v.optional(v.array(v.id("users"))),
    systemSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSystem(ctx, args.systemSecret);

    const targetUserIds = args.userIds
      ? Array.from(new Set(args.userIds))
      : null;
    const sessions = targetUserIds
      ? (
          await Promise.all(
            targetUserIds.map((userId) =>
              ctx.db
                .query("activeFlightSessions")
                .withIndex("by_userId", (q) => q.eq("userId", userId))
                .collect(),
            ),
          )
        ).flat()
      : await ctx.db.query("activeFlightSessions").collect();
    let deleted = 0;

    for (const session of sessions) {
      await ctx.db.delete(session._id);
      deleted++;
    }

    return { deleted };
  },
});
