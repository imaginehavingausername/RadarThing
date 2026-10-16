import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export interface TelemetryCount {
  name: string;
  count: number;
}

export interface FlightTelemetry {
  userId: Id<"users">;
  aircraftType: string;
  depICAO?: string;
  arrICAO?: string;
  included: boolean;
  durationMs: number;
  distanceNm: number;
}

export interface FlightTotals {
  flights: number;
  countedFlights: number;
  flightTimeMs: number;
  distanceNm: number;
  pilotIds: Id<"users">[];
  aircraft: TelemetryCount[];
  airports: TelemetryCount[];
}

export interface ActivityTotals {
  newUsers: number;
  imagesUploaded: number;
  imagesApproved: number;
  chartsUploaded: number;
  acarsMessages: number;
  waypointReminders: number;
}

export function utcDayStart(timestamp: number) {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

export function utcDayKey(timestamp: number) {
  return new Date(utcDayStart(timestamp)).toISOString().slice(0, 10);
}

export function emptyFlightTotals(): FlightTotals {
  return {
    flights: 0,
    countedFlights: 0,
    flightTimeMs: 0,
    distanceNm: 0,
    pilotIds: [],
    aircraft: [],
    airports: [],
  };
}

export function emptyActivityTotals(): ActivityTotals {
  return {
    newUsers: 0,
    imagesUploaded: 0,
    imagesApproved: 0,
    chartsUploaded: 0,
    acarsMessages: 0,
    waypointReminders: 0,
  };
}

function normalizeName(value?: string) {
  return value?.trim().toUpperCase().slice(0, 60) ?? "";
}

function bumpCount(counts: TelemetryCount[], rawName?: string) {
  const name = normalizeName(rawName);
  if (!name) return counts;
  const existing = counts.find((entry) => entry.name === name);
  if (existing) {
    existing.count += 1;
  } else {
    counts.push({ name, count: 1 });
  }
  return counts;
}

export function addFlightToTotals(
  totals: FlightTotals,
  flight: FlightTelemetry,
): FlightTotals {
  totals.flights += 1;
  if (!totals.pilotIds.includes(flight.userId)) {
    totals.pilotIds.push(flight.userId);
  }
  bumpCount(totals.aircraft, flight.aircraftType);
  bumpCount(totals.airports, flight.depICAO);
  if (normalizeName(flight.arrICAO) !== normalizeName(flight.depICAO)) {
    bumpCount(totals.airports, flight.arrICAO);
  }
  if (flight.included) {
    totals.countedFlights += 1;
    totals.flightTimeMs += flight.durationMs;
    totals.distanceNm += flight.distanceNm;
  }
  return totals;
}

async function getDay(ctx: MutationCtx, dayStart: number) {
  return await ctx.db
    .query("telemetryDays")
    .withIndex("by_dayStart", (q) => q.eq("dayStart", dayStart))
    .first();
}

export async function upsertTelemetryDay(
  ctx: MutationCtx,
  dayStart: number,
  values: Partial<Omit<Doc<"telemetryDays">, "_id" | "_creationTime">>,
) {
  const existing = await getDay(ctx, dayStart);
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return;
  }
  await ctx.db.insert("telemetryDays", {
    day: utcDayKey(dayStart),
    dayStart,
    ...emptyFlightTotals(),
    ...emptyActivityTotals(),
    ...values,
  });
}

// Called when a flight is saved so today's numbers stay current between the
// nightly reconcile passes.
export async function recordFlightTelemetry(
  ctx: MutationCtx,
  startTime: number,
  flight: FlightTelemetry,
) {
  const dayStart = utcDayStart(startTime);
  const existing = await getDay(ctx, dayStart);
  const totals = addFlightToTotals(
    existing
      ? {
          flights: existing.flights,
          countedFlights: existing.countedFlights,
          flightTimeMs: existing.flightTimeMs,
          distanceNm: existing.distanceNm,
          pilotIds: [...existing.pilotIds],
          aircraft: existing.aircraft.map((entry) => ({ ...entry })),
          airports: existing.airports.map((entry) => ({ ...entry })),
        }
      : emptyFlightTotals(),
    flight,
  );
  await upsertTelemetryDay(ctx, dayStart, totals);
}

export async function recordLiveSample(
  ctx: MutationCtx,
  liveFlights: number,
  now = Date.now(),
) {
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const existing = await ctx.db
    .query("telemetryLiveHours")
    .withIndex("by_hourStart", (q) => q.eq("hourStart", hourStart))
    .first();

  if (!existing) {
    await ctx.db.insert("telemetryLiveHours", {
      hourStart,
      peak: liveFlights,
      peakAt: now,
      sampleSum: liveFlights,
      sampleCount: 1,
      last: liveFlights,
      lastAt: now,
    });
    return;
  }

  const isNewPeak = liveFlights > existing.peak;
  await ctx.db.patch(existing._id, {
    peak: isNewPeak ? liveFlights : existing.peak,
    peakAt: isNewPeak ? now : existing.peakAt,
    sampleSum: existing.sampleSum + liveFlights,
    sampleCount: existing.sampleCount + 1,
    last: liveFlights,
    lastAt: now,
  });
}
