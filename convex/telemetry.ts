import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { calculateRouteDistanceNm } from "./lib/challengeRules";
import {
  DAY_MS,
  HOUR_MS,
  addFlightToTotals,
  emptyFlightTotals,
  upsertTelemetryDay,
  utcDayKey,
  utcDayStart,
  type ActivityTotals,
  type FlightTelemetry,
  type TelemetryCount,
} from "./lib/telemetry";
import { getRecordedFlightDurationMs, getStatsExcludedReason } from "./flights";

const SUPER_ADMIN_GOOGLE_ID = "101233162035372298523";
// Route data makes flights large; keep each page well under read limits.
const FLIGHT_PAGE_SIZE = 25;
const ACTIVITY_PAGE_SIZE = 1000;
const RECONCILE_DAYS_PER_RUN = 5;
const LIVE_HOURS_RETENTION_DAYS = 35;
const RECONCILE_RETRY_MS = 10 * 60 * 1000;
const TOTALS_PAGE_SIZE = 500;
const DAY_TOTALS_PAGE_SIZE = 100;
// "New pilot" means no flight in this many days before the period.
const FIRST_SEEN_LOOKBACK_DAYS = 365;
const RETENTION_COHORT_WEEKS = 8;
const RETENTION_WEEKS_TRACKED = 6;
const TOP_LIST_SIZE = 8;

async function isSuperAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  return user?.googleId === SUPER_ADMIN_GOOGLE_ID;
}

async function requireSuperAdmin(ctx: MutationCtx) {
  if (!(await isSuperAdmin(ctx))) throw new Error("Unauthorized");
}

// ---------------------------------------------------------------------------
// Rollup builders
// ---------------------------------------------------------------------------

export const flightPage = internalQuery({
  args: {
    dayStart: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("flights")
      .withIndex("by_startTime", (q) =>
        q
          .gte("startTime", args.dayStart)
          .lt("startTime", args.dayStart + DAY_MS),
      )
      .paginate({ cursor: args.cursor, numItems: FLIGHT_PAGE_SIZE });

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      flights: result.page.map((flight): FlightTelemetry => {
        const included = !getStatsExcludedReason(flight);
        return {
          userId: flight.userId,
          aircraftType: flight.aircraftType,
          depICAO: flight.depICAO,
          arrICAO: flight.arrICAO,
          included,
          durationMs: included ? getRecordedFlightDurationMs(flight) : 0,
          distanceNm: included ? calculateRouteDistanceNm(flight.routeData) : 0,
        };
      }),
    };
  },
});

const activityTableValidator = v.union(
  v.literal("users"),
  v.literal("aircraftImages"),
  v.literal("airportCharts"),
  v.literal("acarsMessages"),
  v.literal("waypointReminders"),
);
type ActivityTable =
  | "users"
  | "aircraftImages"
  | "airportCharts"
  | "acarsMessages"
  | "waypointReminders";

async function createdInDayPage(
  ctx: QueryCtx,
  table: ActivityTable,
  dayStart: number,
  cursor: string | null,
) {
  const dayEnd = dayStart + DAY_MS;
  const paginationOpts = { cursor, numItems: ACTIVITY_PAGE_SIZE };
  switch (table) {
    case "users":
      return await ctx.db
        .query("users")
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", dayStart).lt("_creationTime", dayEnd),
        )
        .paginate(paginationOpts);
    case "aircraftImages":
      return await ctx.db
        .query("aircraftImages")
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", dayStart).lt("_creationTime", dayEnd),
        )
        .paginate(paginationOpts);
    case "airportCharts":
      return await ctx.db
        .query("airportCharts")
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", dayStart).lt("_creationTime", dayEnd),
        )
        .paginate(paginationOpts);
    case "acarsMessages":
      return await ctx.db
        .query("acarsMessages")
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", dayStart).lt("_creationTime", dayEnd),
        )
        .paginate(paginationOpts);
    case "waypointReminders":
      return await ctx.db
        .query("waypointReminders")
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", dayStart).lt("_creationTime", dayEnd),
        )
        .paginate(paginationOpts);
  }
}

export const activityPage = internalQuery({
  args: {
    table: activityTableValidator,
    dayStart: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await createdInDayPage(
      ctx,
      args.table,
      args.dayStart,
      args.cursor,
    );
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      count: result.page.length,
      approved: result.page.filter(
        (doc) => "isApproved" in doc && doc.isApproved,
      ).length,
    };
  },
});

// Counts rows created during the day, one page per transaction so a busy day
// (ACARS especially) cannot exceed per-query read limits.
async function countActivity(
  ctx: ActionCtx,
  dayStart: number,
): Promise<ActivityTotals> {
  const countTable = async (table: ActivityTable) => {
    let count = 0;
    let approved = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: {
        isDone: boolean;
        continueCursor: string;
        count: number;
        approved: number;
      } = await ctx.runQuery(internal.telemetry.activityPage, {
        table,
        dayStart,
        cursor,
      });
      count += page.count;
      approved += page.approved;
      if (page.isDone) return { count, approved };
      cursor = page.continueCursor;
    }
  };

  const [users, images, charts, acarsMessages, reminders] = await Promise.all([
    countTable("users"),
    countTable("aircraftImages"),
    countTable("airportCharts"),
    countTable("acarsMessages"),
    countTable("waypointReminders"),
  ]);

  return {
    newUsers: users.count,
    imagesUploaded: images.count,
    imagesApproved: images.approved,
    chartsUploaded: charts.count,
    acarsMessages: acarsMessages.count,
    waypointReminders: reminders.count,
  };
}

export const writeActivity = internalMutation({
  args: {
    dayStart: v.number(),
    newUsers: v.number(),
    imagesUploaded: v.number(),
    imagesApproved: v.number(),
    chartsUploaded: v.number(),
    acarsMessages: v.number(),
    waypointReminders: v.number(),
  },
  handler: async (ctx, { dayStart, ...activity }) => {
    await upsertTelemetryDay(ctx, dayStart, {
      ...activity,
      activityCountedAt: Date.now(),
    });
  },
});

export const refreshActivity = internalAction({
  args: { dayStart: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const dayStart = utcDayStart(args.dayStart ?? Date.now());
    await ctx.runMutation(internal.telemetry.writeActivity, {
      dayStart,
      ...(await countActivity(ctx, dayStart)),
    });
  },
});

export const writeFlightTotals = internalMutation({
  args: {
    dayStart: v.number(),
    flights: v.number(),
    countedFlights: v.number(),
    flightTimeMs: v.number(),
    distanceNm: v.number(),
    pilotIds: v.array(v.id("users")),
    aircraft: v.array(v.object({ name: v.string(), count: v.number() })),
    airports: v.array(v.object({ name: v.string(), count: v.number() })),
  },
  handler: async (ctx, { dayStart, ...totals }) => {
    await upsertTelemetryDay(ctx, dayStart, {
      ...totals,
      flightsReconciledAt: Date.now(),
    });
  },
});

export const userTotalsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), now: v.number() },
  handler: async (ctx, { cursor, now }) => {
    const result = await ctx.db
      .query("users")
      .paginate({ cursor, numItems: TOTALS_PAGE_SIZE });
    const active = result.page.filter((user) => !user.isDeleted);
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      users: active.length,
      paidPro: active.filter(
        (user) => user.role === "PRO" && Boolean(user.stripeSubscriptionId),
      ).length,
      grantedPro: active.filter(
        (user) =>
          user.role !== "ADMIN" &&
          !user.stripeSubscriptionId &&
          (user.role === "PRO" || (user.adminProExpiresAt ?? 0) > now),
      ).length,
      bannedUsers: active.filter((user) => user.activeBanId).length,
    };
  },
});

export const imageTotalsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("aircraftImages")
      .paginate({ cursor, numItems: TOTALS_PAGE_SIZE });
    const approved = result.page.filter((image) => image.isApproved).length;
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      approved,
      pending: result.page.length - approved,
    };
  },
});

export const dayTotalsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("telemetryDays")
      .withIndex("by_dayStart")
      .paginate({ cursor, numItems: DAY_TOTALS_PAGE_SIZE });
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      days: result.page.map((day) => ({
        day: day.day,
        flights: day.flights,
        flightTimeMs: day.flightTimeMs,
        pilotIds: day.pilotIds,
        livePeak: day.livePeak,
        livePeakAt: day.livePeakAt,
        flightsReconciledAt: day.flightsReconciledAt,
      })),
    };
  },
});

export const writeTotals = internalMutation({
  args: {
    flights: v.number(),
    pilots: v.number(),
    flightTimeMs: v.number(),
    firstDay: v.optional(v.string()),
    lastReconciledAt: v.optional(v.number()),
    allTimePeak: v.optional(v.number()),
    allTimePeakAt: v.optional(v.number()),
    users: v.number(),
    paidPro: v.number(),
    grantedPro: v.number(),
    bannedUsers: v.number(),
    approvedImages: v.number(),
    pendingImages: v.number(),
  },
  handler: async (ctx, totals) => {
    const existing = await ctx.db.query("telemetryTotals").first();
    const value = { ...totals, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("telemetryTotals", value);
    }
  },
});

export const refreshTotals = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const totals: {
      flights: number;
      pilots: number;
      flightTimeMs: number;
      firstDay?: string;
      lastReconciledAt?: number;
      allTimePeak?: number;
      allTimePeakAt?: number;
      users: number;
      paidPro: number;
      grantedPro: number;
      bannedUsers: number;
      approvedImages: number;
      pendingImages: number;
    } = {
      flights: 0,
      pilots: 0,
      flightTimeMs: 0,
      users: 0,
      paidPro: 0,
      grantedPro: 0,
      bannedUsers: 0,
      approvedImages: 0,
      pendingImages: 0,
    };

    let cursor: string | null = null;
    for (;;) {
      const page: {
        isDone: boolean;
        continueCursor: string;
        users: number;
        paidPro: number;
        grantedPro: number;
        bannedUsers: number;
      } = await ctx.runQuery(internal.telemetry.userTotalsPage, {
        cursor,
        now,
      });
      totals.users += page.users;
      totals.paidPro += page.paidPro;
      totals.grantedPro += page.grantedPro;
      totals.bannedUsers += page.bannedUsers;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    cursor = null;
    for (;;) {
      const page: {
        isDone: boolean;
        continueCursor: string;
        approved: number;
        pending: number;
      } = await ctx.runQuery(internal.telemetry.imageTotalsPage, { cursor });
      totals.approvedImages += page.approved;
      totals.pendingImages += page.pending;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const pilots = new Set<string>();
    cursor = null;
    for (;;) {
      const page: {
        isDone: boolean;
        continueCursor: string;
        days: {
          day: string;
          flights: number;
          flightTimeMs: number;
          pilotIds: string[];
          livePeak?: number;
          livePeakAt?: number;
          flightsReconciledAt?: number;
        }[];
      } = await ctx.runQuery(internal.telemetry.dayTotalsPage, { cursor });
      for (const day of page.days) {
        totals.firstDay ??= day.day;
        totals.flights += day.flights;
        totals.flightTimeMs += day.flightTimeMs;
        for (const pilotId of day.pilotIds) pilots.add(pilotId);
        if (
          day.flightsReconciledAt !== undefined &&
          day.flightsReconciledAt > (totals.lastReconciledAt ?? 0)
        ) {
          totals.lastReconciledAt = day.flightsReconciledAt;
        }
        if (
          day.livePeak !== undefined &&
          day.livePeak > (totals.allTimePeak ?? 0)
        ) {
          totals.allTimePeak = day.livePeak;
          totals.allTimePeakAt = day.livePeakAt;
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    totals.pilots = pilots.size;

    await ctx.runMutation(internal.telemetry.writeTotals, totals);
  },
});

// Folds the day's hourly live samples into the day rollup so dashboards never
// read hourly rows. Leaves existing values alone once the hours are pruned.
export const writeLiveSummary = internalMutation({
  args: { dayStart: v.number() },
  handler: async (ctx, { dayStart }) => {
    const hours = await ctx.db
      .query("telemetryLiveHours")
      .withIndex("by_hourStart", (q) =>
        q.gte("hourStart", dayStart).lt("hourStart", dayStart + DAY_MS),
      )
      .collect();
    const [first] = hours;
    if (!first) return;

    let peak = first;
    let sampleSum = 0;
    let sampleCount = 0;
    for (const hour of hours) {
      if (hour.peak > peak.peak) peak = hour;
      sampleSum += hour.sampleSum;
      sampleCount += hour.sampleCount;
    }
    await upsertTelemetryDay(ctx, dayStart, {
      livePeak: peak.peak,
      livePeakAt: peak.peakAt,
      liveAvg: sampleCount ? sampleSum / sampleCount : 0,
    });
  },
});

// Rebuilds flight, activity, and live rollups for [fromDayStart, toDayStart]
// from raw data. Processes a few days per run and reschedules itself.
export const reconcileDays = internalAction({
  args: { fromDayStart: v.number(), toDayStart: v.number() },
  handler: async (ctx, args) => {
    const from = utcDayStart(args.fromDayStart);
    const to = utcDayStart(args.toDayStart);
    let dayStart = from;

    for (
      let processed = 0;
      processed < RECONCILE_DAYS_PER_RUN && dayStart <= to;
      processed++, dayStart += DAY_MS
    ) {
      const totals = emptyFlightTotals();
      let cursor: string | null = null;
      for (;;) {
        const page: {
          isDone: boolean;
          continueCursor: string;
          flights: FlightTelemetry[];
        } = await ctx.runQuery(internal.telemetry.flightPage, {
          dayStart,
          cursor,
        });
        for (const flight of page.flights) addFlightToTotals(totals, flight);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      await ctx.runMutation(internal.telemetry.writeFlightTotals, {
        dayStart,
        ...totals,
      });
      await ctx.runMutation(internal.telemetry.writeActivity, {
        dayStart,
        ...(await countActivity(ctx, dayStart)),
      });
      await ctx.runMutation(internal.telemetry.writeLiveSummary, { dayStart });
    }

    if (dayStart <= to) {
      await ctx.scheduler.runAfter(0, internal.telemetry.reconcileDays, {
        fromDayStart: dayStart,
        toDayStart: to,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.telemetry.refreshTotals, {});
    }
  },
});

export const reconcileYesterday = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Don't overlap a rebuild or manual recount; try again shortly instead so
    // yesterday still gets its live summary before hourly samples are pruned.
    if (await isReconcileRunning(ctx)) {
      await ctx.scheduler.runAfter(
        RECONCILE_RETRY_MS,
        internal.telemetry.reconcileYesterday,
        {},
      );
      return;
    }
    const yesterday = utcDayStart(Date.now()) - DAY_MS;
    await ctx.scheduler.runAfter(0, internal.telemetry.reconcileDays, {
      fromDayStart: yesterday,
      toDayStart: yesterday,
    });
  },
});

// Hourly samples are only needed until the nightly reconcile folds them into
// the day rollup; keep a margin in case a reconcile run fails.
export const pruneLiveHours = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - LIVE_HOURS_RETENTION_DAYS * DAY_MS;
    const stale = await ctx.db
      .query("telemetryLiveHours")
      .withIndex("by_hourStart", (q) => q.lt("hourStart", cutoff))
      .take(500);
    for (const doc of stale) await ctx.db.delete(doc._id);
  },
});

// ---------------------------------------------------------------------------
// Super-admin controls
// ---------------------------------------------------------------------------

// Scheduled-function records are the source of truth for whether a reconcile
// chain is still running, so a failed run can never leave a stale lock.
async function isReconcileRunning(ctx: MutationCtx) {
  // Convex keeps finished jobs for ~7 days, so this scan stays small; filtering
  // on state (rather than taking the newest N) can't miss an older live job.
  const scheduled = await ctx.db.system
    .query("_scheduled_functions")
    .filter((q) =>
      q.or(
        q.eq(q.field("state.kind"), "pending"),
        q.eq(q.field("state.kind"), "inProgress"),
      ),
    )
    .collect();
  return scheduled.some(
    (job) =>
      job.name.startsWith("telemetry:reconcileDays") &&
      (job.state.kind === "pending" || job.state.kind === "inProgress"),
  );
}

async function scheduleReconcile(
  ctx: MutationCtx,
  fromDayStart: number,
  toDayStart: number,
) {
  if (await isReconcileRunning(ctx)) {
    throw new ConvexError(
      "A telemetry recount is already running. Try again when it finishes.",
    );
  }
  await ctx.scheduler.runAfter(0, internal.telemetry.reconcileDays, {
    fromDayStart,
    toDayStart,
  });
}

export const rebuildHistory = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const firstFlight = await ctx.db
      .query("flights")
      .withIndex("by_startTime")
      .order("asc")
      .first();
    const from = utcDayStart(firstFlight?.startTime ?? Date.now());
    await scheduleReconcile(ctx, from, utcDayStart(Date.now()));
    return { fromDay: utcDayKey(from) };
  },
});

export const refreshToday = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const today = utcDayStart(Date.now());
    await scheduleReconcile(ctx, today, today);
    await ctx.scheduler.runAfter(0, internal.telemetry.refreshTotals, {});
  },
});

// ---------------------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------------------

// Kept separate from getDashboard: live hours are patched every 30 seconds, so
// this query re-runs often and must stay small.
export const getLive = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isSuperAdmin(ctx))) return null;

    const now = Date.now();
    const since = Math.floor(now / HOUR_MS) * HOUR_MS - 47 * HOUR_MS;
    const hours = await ctx.db
      .query("telemetryLiveHours")
      .withIndex("by_hourStart", (q) => q.gte("hourStart", since))
      .collect();
    const latest = hours[hours.length - 1];
    const todayStart = utcDayStart(now);
    const today = hours.filter((hour) => hour.hourStart >= todayStart);
    const todayPeak = today.reduce<Doc<"telemetryLiveHours"> | null>(
      (best, hour) => (!best || hour.peak > best.peak ? hour : best),
      null,
    );

    return {
      current: latest?.last ?? 0,
      currentAt: latest?.lastAt ?? null,
      todayPeak: todayPeak?.peak ?? 0,
      todayPeakAt: todayPeak?.peakAt ?? null,
      hours: hours.map((hour) => ({
        hourStart: hour.hourStart,
        peak: hour.peak,
        avg: hour.sampleCount ? hour.sampleSum / hour.sampleCount : 0,
      })),
    };
  },
});

type DayDoc = Doc<"telemetryDays">;

interface PeriodPoint {
  start: number;
  flights: number;
  pilots: number;
  newPilots: number;
  flightHours: number;
  distanceNm: number;
  newUsers: number;
  imagesUploaded: number;
  chartsUploaded: number;
  acarsMessages: number;
  livePeak: number;
  liveAvg: number;
}

function weekStartOf(dayStart: number) {
  // Epoch day 0 was a Thursday; shift so weeks start on Monday (UTC).
  const dayIndex = Math.floor(dayStart / DAY_MS);
  return dayStart - ((dayIndex + 3) % 7) * DAY_MS;
}

function mergeCounts(target: Map<string, number>, counts: TelemetryCount[]) {
  for (const { name, count } of counts) {
    target.set(name, (target.get(name) ?? 0) + count);
  }
}

function topCounts(counts: Map<string, number>) {
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_LIST_SIZE);
}

function summarize(
  days: DayDoc[],
  firstSeenDay: Map<Id<"users">, number>,
  start: number,
  end: number,
): PeriodPoint {
  const pilots = new Set<Id<"users">>();
  const point: PeriodPoint = {
    start,
    flights: 0,
    pilots: 0,
    newPilots: 0,
    flightHours: 0,
    distanceNm: 0,
    newUsers: 0,
    imagesUploaded: 0,
    chartsUploaded: 0,
    acarsMessages: 0,
    livePeak: 0,
    liveAvg: 0,
  };
  let liveAvgSum = 0;
  let liveDays = 0;

  for (const day of days) {
    if (day.dayStart < start || day.dayStart >= end) continue;
    point.flights += day.flights;
    point.flightHours += day.flightTimeMs / HOUR_MS;
    point.distanceNm += day.distanceNm;
    point.newUsers += day.newUsers;
    point.imagesUploaded += day.imagesUploaded;
    point.chartsUploaded += day.chartsUploaded;
    point.acarsMessages += day.acarsMessages;
    for (const pilotId of day.pilotIds) pilots.add(pilotId);
    if (day.livePeak !== undefined) {
      point.livePeak = Math.max(point.livePeak, day.livePeak);
      liveAvgSum += day.liveAvg ?? 0;
      liveDays++;
    }
  }

  point.pilots = pilots.size;
  for (const pilotId of pilots) {
    const first = firstSeenDay.get(pilotId);
    if (first !== undefined && first >= start) point.newPilots++;
  }
  point.liveAvg = liveDays ? liveAvgSum / liveDays : 0;
  return point;
}

export const getDashboard = query({
  args: { rangeDays: v.number() },
  handler: async (ctx, args) => {
    if (!(await isSuperAdmin(ctx))) return null;

    const rangeDays = Math.max(1, Math.min(Math.round(args.rangeDays), 365));
    const now = Date.now();
    const todayStart = utcDayStart(now);
    const rangeStart = todayStart - (rangeDays - 1) * DAY_MS;
    const rangeEnd = todayStart + DAY_MS;
    const previousStart = rangeStart - rangeDays * DAY_MS;

    const thisWeek = weekStartOf(todayStart);
    const weeksBack = Math.max(12, Math.ceil(rangeDays / 7));
    const firstWeek = thisWeek - (weeksBack - 1) * 7 * DAY_MS;
    const thisMonth = new Date(todayStart);
    const firstMonth = Date.UTC(
      thisMonth.getUTCFullYear(),
      thisMonth.getUTCMonth() - 11,
      1,
    );
    const firstCohortWeek = thisWeek - RETENTION_COHORT_WEEKS * 7 * DAY_MS;
    // Read only what the charts need, plus a lookback so "new pilot" means no
    // flight in the prior year rather than "first row we happened to load".
    const windowStart =
      Math.min(previousStart, firstWeek, firstMonth, firstCohortWeek) -
      FIRST_SEEN_LOOKBACK_DAYS * DAY_MS;

    const days = await ctx.db
      .query("telemetryDays")
      .withIndex("by_dayStart", (q) => q.gte("dayStart", windowStart))
      .order("asc")
      .collect();

    const firstSeenDay = new Map<Id<"users">, number>();
    const activeDaysByPilot = new Map<Id<"users">, Set<number>>();
    for (const day of days) {
      for (const pilotId of day.pilotIds) {
        if (!firstSeenDay.has(pilotId)) firstSeenDay.set(pilotId, day.dayStart);
        const activeDays = activeDaysByPilot.get(pilotId) ?? new Set<number>();
        activeDays.add(day.dayStart);
        activeDaysByPilot.set(pilotId, activeDays);
      }
    }

    const current = summarize(days, firstSeenDay, rangeStart, rangeEnd);
    const previous = summarize(days, firstSeenDay, previousStart, rangeStart);

    // Series: daily for the selected range, weekly and monthly further back.
    const daySeries: PeriodPoint[] = [];
    for (let start = rangeStart; start < rangeEnd; start += DAY_MS) {
      daySeries.push(summarize(days, firstSeenDay, start, start + DAY_MS));
    }
    const weekSeries: PeriodPoint[] = [];
    for (let start = firstWeek; start <= thisWeek; start += 7 * DAY_MS) {
      weekSeries.push(summarize(days, firstSeenDay, start, start + 7 * DAY_MS));
    }
    const monthSeries: PeriodPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = Date.UTC(
        thisMonth.getUTCFullYear(),
        thisMonth.getUTCMonth() - i,
        1,
      );
      const end = Date.UTC(
        thisMonth.getUTCFullYear(),
        thisMonth.getUTCMonth() - i + 1,
        1,
      );
      monthSeries.push(summarize(days, firstSeenDay, start, end));
    }

    // Engagement: unique pilots over trailing windows ending today.
    const uniquePilotsBetween = (start: number, end = rangeEnd) => {
      const pilots = new Set<Id<"users">>();
      for (const day of days) {
        if (day.dayStart < start || day.dayStart >= end) continue;
        for (const pilotId of day.pilotIds) pilots.add(pilotId);
      }
      return pilots.size;
    };
    const mau = uniquePilotsBetween(todayStart - 29 * DAY_MS);
    // Stickiness uses the 30 complete days before today so the in-progress
    // day doesn't drag the average down.
    const stickinessStart = todayStart - 30 * DAY_MS;
    const avgDau30 =
      days
        .filter(
          (day) => day.dayStart >= stickinessStart && day.dayStart < todayStart,
        )
        .reduce((sum, day) => sum + day.pilotIds.length, 0) / 30;
    const completeMau = uniquePilotsBetween(stickinessStart, todayStart);

    // Weekly retention cohorts by first-flight week: share of the cohort that
    // flew again in each following week.
    const cohorts: {
      weekStart: number;
      size: number;
      retained: (number | null)[];
    }[] = [];
    for (let i = RETENTION_COHORT_WEEKS; i >= 1; i--) {
      const weekStart = thisWeek - i * 7 * DAY_MS;
      const members = Array.from(firstSeenDay.entries())
        .filter(([, first]) => weekStartOf(first) === weekStart)
        .map(([pilotId]) => pilotId);
      const retained: (number | null)[] = [];
      for (let w = 1; w <= RETENTION_WEEKS_TRACKED; w++) {
        const start = weekStart + w * 7 * DAY_MS;
        if (start > todayStart) {
          retained.push(null);
          continue;
        }
        const end = start + 7 * DAY_MS;
        const returned = members.filter((pilotId) => {
          for (const day of activeDaysByPilot.get(pilotId) ?? []) {
            if (day >= start && day < end) return true;
          }
          return false;
        }).length;
        retained.push(members.length ? returned / members.length : null);
      }
      cohorts.push({ weekStart, size: members.length, retained });
    }

    // Returning pilots in range: flew in range and had flown before it.
    const pilotsInRange = new Set<Id<"users">>();
    const aircraft = new Map<string, number>();
    const airports = new Map<string, number>();
    for (const day of days) {
      if (day.dayStart < rangeStart || day.dayStart >= rangeEnd) continue;
      for (const pilotId of day.pilotIds) pilotsInRange.add(pilotId);
      mergeCounts(aircraft, day.aircraft);
      mergeCounts(airports, day.airports);
    }
    let returningPilots = 0;
    for (const pilotId of pilotsInRange) {
      if ((firstSeenDay.get(pilotId) ?? rangeStart) < rangeStart) {
        returningPilots++;
      }
    }

    return {
      rangeDays,
      current,
      previous,
      returningPilots,
      series: { day: daySeries, week: weekSeries, month: monthSeries },
      engagement: {
        dau:
          days.find((day) => day.dayStart === todayStart)?.pilotIds.length ?? 0,
        wau: uniquePilotsBetween(todayStart - 6 * DAY_MS),
        mau,
        avgDau30,
        stickiness: completeMau ? avgDau30 / completeMau : 0,
      },
      retention: { cohorts },
      top: { aircraft: topCounts(aircraft), airports: topCounts(airports) },
    };
  },
});

// All-time totals come from a snapshot written by refreshTotals, so this
// query reads one document instead of every day and every user.
export const getTotals = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isSuperAdmin(ctx))) return null;

    const snapshot = await ctx.db.query("telemetryTotals").first();
    if (!snapshot) return { snapshot: null };
    return {
      snapshot: {
        ...snapshot,
        flightHours: snapshot.flightTimeMs / HOUR_MS,
        hasHistory: snapshot.lastReconciledAt !== undefined,
        allTimePeak: {
          peak: snapshot.allTimePeak ?? 0,
          at: snapshot.allTimePeakAt ?? null,
        },
      },
    };
  },
});
