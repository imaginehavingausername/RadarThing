import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

import { requireAuthenticatedClerkId } from "./lib/auth";

const MIN_TRACKERS_FOR_MOST_TRACKED = 3;
const ANONYMOUS_TRACKER_ID =
  /^anon:(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]+:[a-z0-9]+)$/i;

async function requireTrackerAccess(
  ctx: Parameters<typeof requireAuthenticatedClerkId>[0],
  trackerId: string,
) {
  if (ANONYMOUS_TRACKER_ID.test(trackerId)) {
    // Anonymous visitors have a random, browser-persisted tracker ID.
    // Still enforce account restrictions if an authenticated user sends one.
    if (await ctx.auth.getUserIdentity()) {
      await requireAuthenticatedClerkId(ctx);
    }
    return;
  }

  await requireAuthenticatedClerkId(ctx, trackerId);
}

function getRankedTrackerCounts(
  trackers: { callsign: string }[],
): { callsign: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const tracker of trackers) {
    const callsign = tracker.callsign.trim().toUpperCase();
    if (!callsign) continue;
    counts.set(callsign, (counts.get(callsign) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([callsign, count]) => ({ callsign, count }))
    .sort((a, b) => b.count - a.count || a.callsign.localeCompare(b.callsign));
}

export const startTracking = mutation({
  args: {
    clerkId: v.string(),
    callsigns: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireTrackerAccess(ctx, args.clerkId);
    const callsigns = Array.from(
      new Set(
        args.callsigns.map((callsign) => callsign.trim()).filter(Boolean),
      ),
    );

    // Replace any existing tracking entries for this user with the current selection.
    const existing = await ctx.db
      .query("activeTrackers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const entry of existing) {
      await ctx.db.delete(entry._id);
    }

    for (const callsign of callsigns) {
      await ctx.db.insert("activeTrackers", {
        clerkId: args.clerkId,
        callsign,
        lastSeen: Date.now(),
      });
    }
  },
});

export const stopTracking = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireTrackerAccess(ctx, args.clerkId);
    const existing = await ctx.db
      .query("activeTrackers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    for (const entry of existing) {
      await ctx.db.delete(entry._id);
    }
  },
});

export const heartbeat = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireTrackerAccess(ctx, args.clerkId);
    const existing = await ctx.db
      .query("activeTrackers")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .collect();

    const now = Date.now();
    for (const entry of existing) {
      await ctx.db.patch(entry._id, { lastSeen: now });
    }
  },
});

export const getMostTracked = query({
  handler: async (ctx) => {
    const allTrackers = await ctx.db.query("activeTrackers").collect();

    // Sort by count descending, take top 10
    return getRankedTrackerCounts(allTrackers).slice(0, 10);
  },
});

export const getTrackingStatus = query({
  args: { callsign: v.string() },
  handler: async (ctx, args) => {
    const callsign = args.callsign.trim().toUpperCase();
    if (!callsign) {
      return { isMostTracked: false, count: 0 };
    }

    const allTrackers = await ctx.db.query("activeTrackers").collect();
    const ranked = getRankedTrackerCounts(allTrackers);
    const count =
      ranked.find((entry) => entry.callsign === callsign)?.count ?? 0;
    const leadingCount = ranked[0]?.count ?? 0;

    return {
      isMostTracked:
        count >= MIN_TRACKERS_FOR_MOST_TRACKED && count === leadingCount,
      count,
    };
  },
});

export const cleanupStale = internalMutation({
  handler: async (ctx) => {
    const threeMinutesAgo = Date.now() - 3 * 60 * 1000;

    const stale = await ctx.db
      .query("activeTrackers")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", threeMinutesAgo))
      .collect();

    for (const entry of stale) {
      await ctx.db.delete(entry._id);
    }
  },
});
