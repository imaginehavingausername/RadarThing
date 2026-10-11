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

export default crons;
