"use server";

import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api, convex } from "~/server/convex";
import {
  RADARTHING_ACCOUNT_DATA_EXPORT_VERSION,
  type RadarThingAccountDataExport,
} from "~/lib/account-data-export";

export async function getCurrentUserDataExport(): Promise<RadarThingAccountDataExport> {
  const { userId, getToken } = await auth();
  if (!userId) {
    throw new Error("You must be signed in to export your data");
  }

  const user = await convex.query(api.users.getByClerkId, {
    clerkId: userId,
  });

  if (!user || user.isDeleted) {
    throw new Error("Your RadarThing account could not be found");
  }

  const token = await getToken({ template: "convex" });
  if (!token) throw new Error("You must be signed in to export your data");
  const exportConvex = new ConvexHttpClient(
    process.env.NEXT_PUBLIC_CONVEX_URL!,
  );
  exportConvex.setAuth(token);
  const [
    stats,
    flights,
    messagesByUser,
    messagesByGoogle,
    blockedByUser,
    blockedByGoogle,
    reports,
  ] = await Promise.all([
    convex.query(api.flights.getStatsByClerkId, { clerkId: userId }),
    convex.query(api.flights.getByUserId, { userId: user._id }),
    loadAll((cursor) =>
      exportConvex.query(api.acars.exportMessages, {
        source: "user",
        paginationOpts: { numItems: 100, cursor },
      }),
    ),
    loadAll((cursor) =>
      exportConvex.query(api.acars.exportMessages, {
        source: "google",
        paginationOpts: { numItems: 100, cursor },
      }),
    ),
    loadAll((cursor) =>
      exportConvex.query(api.acars.exportBlocked, {
        source: "user",
        paginationOpts: { numItems: 100, cursor },
      }),
    ),
    loadAll((cursor) =>
      exportConvex.query(api.acars.exportBlocked, {
        source: "google",
        paginationOpts: { numItems: 100, cursor },
      }),
    ),
    loadAll((cursor) =>
      exportConvex.query(api.acars.exportReports, {
        paginationOpts: { numItems: 100, cursor },
      }),
    ),
  ]);
  const acars = {
    messages: dedupeById([...messagesByUser, ...messagesByGoogle]),
    blocked: dedupeById([...blockedByUser, ...blockedByGoogle]),
    reports,
  };

  return {
    schema: "radarthing.account_data",
    version: RADARTHING_ACCOUNT_DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    account: {
      id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      googleId: user.googleId,
      role: user.role,
      discordUsername: user.discordUsername,
      createdAt: user._creationTime,
    },
    stats: serializeStats(stats),
    acars,
    flights: flights
      .sort((a, b) => b.startTime - a.startTime)
      .map((flight) => ({
        id: flight._id,
        createdAt: flight._creationTime,
        callsign: flight.callsign,
        aircraftType: flight.aircraftType,
        depICAO: flight.depICAO,
        arrICAO: flight.arrICAO,
        squawk: flight.squawk,
        startTime: flight.startTime,
        endTime: flight.endTime,
        duration: flight.duration,
        maxAltitude: flight.maxAltitude,
        maxSpeed: flight.maxSpeed,
        routeData: flight.routeData,
      })),
  };
}

async function loadAll<T>(
  fetchPage: (
    cursor: string | null,
  ) => Promise<{ page: T[]; continueCursor: string; isDone: boolean }>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
}

function dedupeById<T extends { id: string; createdAt: number }>(
  rows: T[],
): T[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

function serializeStats(
  stats: {
    totalFlights: number;
    totalFlightTimeMs: number;
    totalDistanceNm: number;
    uniqueAirports: number;
    currentStreak: number;
    longestStreak: number;
    topAircraft: { name: string; count: number }[];
    topRoutes: { route: string; count: number }[];
    topAirports: { code: string; count: number }[];
  } | null,
): RadarThingAccountDataExport["stats"] {
  if (!stats) return null;

  return {
    totalFlights: stats.totalFlights,
    totalFlightTimeMs: stats.totalFlightTimeMs,
    totalDistanceNm: stats.totalDistanceNm,
    uniqueAirports: stats.uniqueAirports,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    topAircraft: stats.topAircraft,
    topRoutes: stats.topRoutes,
    topAirports: stats.topAirports,
  };
}
