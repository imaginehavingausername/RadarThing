export const RADARTHING_ACCOUNT_DATA_EXPORT_VERSION = 3;

export interface RadarThingAccountDataExport {
  schema: "radarthing.account_data";
  version: typeof RADARTHING_ACCOUNT_DATA_EXPORT_VERSION;
  exportedAt: string;
  account: {
    id: string;
    clerkId: string;
    email: string;
    googleId?: string;
    role: "FREE" | "PRO" | "ADMIN";
    discordUsername?: string;
    createdAt: number;
  };
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
  } | null;
  flights: {
    id: string;
    createdAt: number;
    callsign: string;
    aircraftType: string;
    depICAO?: string;
    arrICAO?: string;
    squawk?: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    maxAltitude?: number;
    maxSpeed?: number;
    routeData?: unknown;
  }[];
  acars: {
    messages: {
      id: string;
      googleId: string;
      body: string;
      createdAt: number;
    }[];
    blocked: {
      id: string;
      googleId: string;
      body: string;
      categories: string[];
      createdAt: number;
    }[];
    reports: {
      id: string;
      googleId: string;
      body: string;
      reason: string;
      createdAt: number;
    }[];
  };
}

export function createAccountDataExportFilename(
  exportData: RadarThingAccountDataExport,
) {
  const date = new Date(exportData.exportedAt).toISOString().slice(0, 10);
  const identity =
    exportData.account.googleId ??
    exportData.account.email.split("@")[0] ??
    "account";

  const cleanIdentity = identity
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `radarthing-${cleanIdentity || "account"}-data-${date}.json`;
}

export function downloadAccountDataExport(
  exportData: RadarThingAccountDataExport,
) {
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = createAccountDataExportFilename(exportData);
  link.click();
  URL.revokeObjectURL(url);
}
