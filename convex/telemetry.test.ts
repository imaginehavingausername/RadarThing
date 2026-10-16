import assert from "node:assert/strict";
import test from "node:test";
import {
  DAY_MS,
  addFlightToTotals,
  emptyFlightTotals,
  utcDayKey,
} from "./lib/telemetry";
import {
  getDashboard,
  getTotals,
  rebuildHistory,
  reconcileYesterday,
} from "./telemetry";

const SUPER_ADMIN_GOOGLE_ID = "101233162035372298523";

function flight(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    userId: userId as never,
    aircraftType: "a320",
    depICAO: "egll",
    arrICAO: "kjfk",
    included: true,
    durationMs: 60 * 60 * 1000,
    distanceNm: 100,
    ...overrides,
  };
}

test("flight totals count unique pilots and exclude non-stat flights from time", () => {
  const totals = emptyFlightTotals();
  addFlightToTotals(totals, flight("a"));
  addFlightToTotals(totals, flight("a", { arrICAO: "EGLL" }));
  addFlightToTotals(
    totals,
    flight("b", { included: false, durationMs: 0, distanceNm: 0 }),
  );

  assert.equal(totals.flights, 3);
  assert.equal(totals.countedFlights, 2);
  assert.equal(totals.flightTimeMs, 2 * 60 * 60 * 1000);
  assert.equal(totals.distanceNm, 200);
  assert.deepEqual(totals.pilotIds, ["a", "b"]);
  assert.deepEqual(totals.aircraft, [{ name: "A320", count: 3 }]);
  // Same-airport departure/arrival counts once.
  assert.deepEqual(totals.airports, [
    { name: "EGLL", count: 3 },
    { name: "KJFK", count: 2 },
  ]);
});

test("day keys are UTC", () => {
  assert.equal(utcDayKey(Date.UTC(2026, 9, 16, 23, 59)), "2026-10-16");
});

function dayDoc(dayStart: number, pilotIds: string[], flights: number) {
  return {
    _id: `day-${dayStart}`,
    day: utcDayKey(dayStart),
    dayStart,
    flights,
    countedFlights: flights,
    flightTimeMs: flights * 30 * 60 * 1000,
    distanceNm: flights * 50,
    pilotIds,
    aircraft: [{ name: "A320", count: flights }],
    airports: [],
    newUsers: 1,
    imagesUploaded: 0,
    imagesApproved: 0,
    chartsUploaded: 0,
    acarsMessages: 0,
    waypointReminders: 0,
    flightsReconciledAt: dayStart + DAY_MS,
    livePeak: flights * 2,
    livePeakAt: dayStart + 1000,
    liveAvg: flights,
  };
}

interface Handler {
  _handler: (ctx: unknown, args: unknown) => Promise<any>;
}
const call = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as Handler)._handler(ctx, args);

const ADMIN_USER = {
  _id: "admin",
  clerkId: "clerk-admin",
  googleId: SUPER_ADMIN_GOOGLE_ID,
  role: "ADMIN",
  isDeleted: false,
};

function createCtx(
  tables: Record<string, unknown[]>,
  scheduledFunctions: unknown[] = [],
) {
  const scheduled: unknown[][] = [];
  return {
    scheduled,
    scheduler: {
      runAfter: (...args: unknown[]) => {
        scheduled.push(args);
        return Promise.resolve("job");
      },
    },
    auth: {
      getUserIdentity: () => Promise.resolve({ subject: "clerk-admin" }),
    },
    db: {
      query(table: string) {
        const rows = tables[table] ?? [];
        return {
          withIndex() {
            return this;
          },
          order() {
            return this;
          },
          collect: () => Promise.resolve(rows),
          first: () => Promise.resolve(rows[0] ?? null),
        };
      },
      system: {
        query: () => ({
          filter() {
            return this;
          },
          collect: () => Promise.resolve(scheduledFunctions),
        }),
      },
    },
  };
}

test("dashboard splits new and returning pilots and builds retention", async () => {
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const days = [
    // Two pilots start 20 days ago; only "a" comes back.
    dayDoc(today - 20 * DAY_MS, ["a", "b"], 3),
    dayDoc(today - 12 * DAY_MS, ["a"], 1),
    dayDoc(today - 2 * DAY_MS, ["a", "c"], 4),
    dayDoc(today, ["c"], 2),
  ];
  const ctx = createCtx({
    users: [ADMIN_USER],
    telemetryDays: days,
    telemetryLiveHours: [],
    aircraftImages: [],
  });

  const result = await call(getDashboard, ctx, { rangeDays: 7 });

  assert.equal(result.current.flights, 6);
  assert.equal(result.current.pilots, 2);
  assert.equal(result.current.newPilots, 1); // "c"
  assert.equal(result.returningPilots, 1); // "a"
  assert.equal(result.previous.flights, 1);
  assert.equal(result.current.livePeak, 8);
  assert.equal(result.engagement.dau, 1);
  assert.equal(result.engagement.mau, 3);
  assert.equal(result.series.day.length, 7);

  const cohort = result.retention.cohorts.find(
    (entry: { size: number }) => entry.size === 2,
  );
  assert.ok(cohort, "cohort of a+b exists");
  assert.ok(
    cohort.retained.some((share: number | null) => share === 0.5),
    "half of the cohort returned in a later week",
  );
});

test("totals read the background snapshot", async () => {
  const ctx = createCtx({
    users: [ADMIN_USER],
    telemetryTotals: [
      {
        flights: 11,
        pilots: 2,
        flightTimeMs: 3_600_000,
        lastReconciledAt: 5,
        allTimePeak: 18,
        allTimePeakAt: 7,
        users: 40,
        paidPro: 3,
        grantedPro: 1,
        bannedUsers: 2,
        approvedImages: 10,
        pendingImages: 4,
        updatedAt: 1,
      },
    ],
  });

  const { snapshot } = await call(getTotals, ctx);
  assert.equal(snapshot.flights, 11);
  assert.equal(snapshot.flightHours, 1);
  assert.deepEqual(snapshot.allTimePeak, { peak: 18, at: 7 });
  assert.equal(snapshot.hasHistory, true);

  const empty = await call(getTotals, createCtx({ users: [ADMIN_USER] }));
  assert.equal(empty.snapshot, null);
});

test("nightly reconcile waits for a running rebuild instead of overlapping", async () => {
  const running = createCtx({}, [
    { name: "telemetry:reconcileDays", state: { kind: "pending" } },
  ]);
  await call(reconcileYesterday, running);
  assert.equal(running.scheduled.length, 1);
  assert.ok((running.scheduled[0]?.[0] as number) > 0, "retries later");

  const idle = createCtx({});
  await call(reconcileYesterday, idle);
  assert.equal(idle.scheduled[0]?.[0], 0);
});

test("rebuild refuses to start while a reconcile is already running", async () => {
  const running = createCtx({ users: [ADMIN_USER], flights: [] }, [
    { name: "telemetry:reconcileDays", state: { kind: "inProgress" } },
  ]);
  await assert.rejects(call(rebuildHistory, running), /already running/);
  assert.equal(running.scheduled.length, 0);

  const idle = createCtx({ users: [ADMIN_USER], flights: [] }, [
    { name: "telemetry:reconcileDays", state: { kind: "success" } },
  ]);
  await call(rebuildHistory, idle);
  assert.equal(idle.scheduled.length, 1);
});
