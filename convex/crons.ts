import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup stale active trackers",
  { minutes: 2 },
  internal.activeTrackers.cleanupStale,
);

crons.interval(
  "cleanup expired ACARS registration limits",
  { minutes: 5 },
  internal.acars.cleanupRegistrationRates,
);

crons.interval(
  "refresh today's telemetry activity counts",
  { minutes: 15 },
  internal.telemetry.refreshActivity,
  {},
);

crons.interval(
  "refresh all-time telemetry totals",
  { hours: 1 },
  internal.telemetry.refreshTotals,
  {},
);

crons.daily(
  "reconcile yesterday's telemetry rollup",
  { hourUTC: 0, minuteUTC: 20 },
  internal.telemetry.reconcileYesterday,
);

crons.daily(
  "prune old live flight telemetry",
  { hourUTC: 3, minuteUTC: 0 },
  internal.telemetry.pruneLiveHours,
);

export default crons;
