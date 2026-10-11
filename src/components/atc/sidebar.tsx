"use client";

import React, {
  useMemo,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";

import { toast } from "sonner";
import { useUserByGoogleId } from "~/hooks/useUserByGoogleId";
import { getCompactAircraftType, normalizeCallsign } from "~/lib/utils";
// Inline SVG icons to avoid bundling entire react-icons library (~7.8MB)
const PlaneInflightIcon = ({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 12h5a2 2 0 0 1 0 4h-15l-3 -6h3l2 2h3l-2 -7h3l4 7z" />
    <path d="M3 16h18" />
  </svg>
);

const HistoryIcon = ({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 8l0 4l2 2" />
    <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
  </svg>
);

const InfoCircleIcon = ({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
    <path d="M12 9h.01" />
    <path d="M11 12h1v4h1" />
  </svg>
);
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { type PositionUpdate } from "~/lib/aircraft-store";
import { useProStatus } from "~/hooks/useProStatus";
import Image from "next/image";
import { useAircraftPhoto } from "~/hooks/useAircraftPhoto";
import { useCurrentUserProfile } from "~/hooks/useCurrentUserProfile";
import { AdSenseInContent } from "~/components/ads/AdSenseInContent";
import { AircraftControlPanel } from "./AircraftControlPanel";
import { AcarsPanel } from "./AcarsPanel";
import Link from "next/link";
import { Analytics } from "~/lib/analytics";
import { useUnitPreferences } from "~/hooks/useUnitPreferences";
import { useTimeDisplayPreference } from "~/hooks/useTimeDisplayPreference";
import { formatRadarTime } from "~/lib/timeDisplay";
import {
  formatSpeed,
  formatAltitude,
  speedLabel,
  altitudeLabel,
} from "~/lib/units";
import {
  calculateFlightProgress,
  parseLiveFlightPlanWaypoints,
  type FlightProgressSnapshot,
  type LiveFlightPlanWaypoint,
} from "~/lib/flightProgress";

const getFlightPhase = (
  altAGL: number,
  vspeed: number,
  flightPlan?: string,
) => {
  if (altAGL < 100) return "onGround";
  if (vspeed > 200) return "climbing";
  if (vspeed < -200)
    return flightPlan && altAGL < 5000 ? "landing" : "descending";
  if (altAGL > 5000) return "cruising";
  return "unknown";
};

const normalizeAirportCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(code) ? code : null;
};

const getPlannedDestination = (flightPlan?: string): string | null => {
  if (!flightPlan) return null;

  try {
    const waypoints = JSON.parse(flightPlan) as Record<string, unknown>[];
    if (!Array.isArray(waypoints) || waypoints.length === 0) return null;

    const destinationWaypoint = waypoints.find(
      (wp) =>
        typeof wp === "object" &&
        wp !== null &&
        typeof wp.type === "string" &&
        wp.type.toUpperCase() === "DST" &&
        typeof wp.ident === "string",
    );

    if (destinationWaypoint?.ident) {
      return normalizeAirportCode(destinationWaypoint.ident);
    }

    const lastWaypoint = waypoints[waypoints.length - 1];
    if (!lastWaypoint || typeof lastWaypoint !== "object") return null;

    return normalizeAirportCode(lastWaypoint.ident);
  } catch {
    return null;
  }
};

const formatDuration = (minutes: number | null | undefined) => {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
    return "---";
  }

  const roundedMinutes = Math.max(0, Math.round(minutes));
  if (roundedMinutes < 1) return "<1m";

  const hours = Math.floor(roundedMinutes / 60);
  const mins = roundedMinutes % 60;

  return hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
};

const formatEtaCountdown = (timestamp: number | null | undefined) => {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return null;
  }

  const minutes = (timestamp - Date.now()) / 60_000;
  const formatted = formatDuration(minutes);
  return formatted === "---" ? null : `In ${formatted}`;
};

export interface HistoryFlight {
  id: string;
  depICAO?: string;
  arrICAO?: string;
  startTime: number;
  endTime?: number;
  aircraftType?: string;
  callsign?: string;
  duration?: number;
  routeData?: [number, number][];
  isLive?: boolean;
}

export const Sidebar = ({
  aircraft,
  onWaypointClick,
  onHistoryClick,
  onAirportClick,
  isMobile,
  onClose,
  isFollowMode,
  onToggleFollow,
}: {
  aircraft: PositionUpdate & { altMSL?: number };
  onWaypointClick?: (waypoint: any, index: number) => void;
  onHistoryClick?: (flight: HistoryFlight) => void;
  onAirportClick?: (icao: string) => void;
  isMobile: boolean;
  onClose?: () => void;
  isFollowMode?: boolean;
  onToggleFollow?: () => void;
}) => {
  const [tab, setTab] = useState<"info" | "history">("info");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [aircraftImageFailed, setAircraftImageFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const compactAircraftType = getCompactAircraftType(aircraft.type);

  // Real-time flight history query
  const { isProUser } = useProStatus();
  const { speedUnit, altitudeUnit } = useUnitPreferences();
  const { timeDisplayMode } = useTimeDisplayPreference();
  const googleId = aircraft.googleId;
  const shouldFetchHistory = tab === "history" && googleId && isProUser;
  const historyQuery = useQuery(
    api.flights.getHistoryByGoogleId,
    shouldFetchHistory && googleId ? { googleId } : "skip",
  );
  const history = useMemo(() => {
    if (!historyQuery) return [];
    return historyQuery.map((flight) => ({
      ...flight,
      startTime: new Date(flight.startTime),
    }));
  }, [historyQuery]);
  const loadingHistory = shouldFetchHistory && historyQuery === undefined;
  const canAccessHistory = isProUser;
  const currentFlightHistory = useMemo<HistoryFlight | null>(() => {
    const liveRoute = aircraft.flightPath;
    if (!liveRoute || liveRoute.length < 2) return null;

    const parsedTakeoff = Date.parse(aircraft.takeoffTime || "");
    const startTime = Number.isFinite(parsedTakeoff)
      ? parsedTakeoff
      : aircraft.ts;

    return {
      id: `live:${aircraft.callsign || aircraft.id}`,
      depICAO: aircraft.departure || "---",
      arrICAO: aircraft.arrival || "---",
      startTime,
      aircraftType: aircraft.type,
      callsign: aircraft.flightNo || aircraft.callsign,
      routeData: liveRoute,
      isLive: true,
    };
  }, [
    aircraft.arrival,
    aircraft.callsign,
    aircraft.departure,
    aircraft.flightNo,
    aircraft.flightPath,
    aircraft.id,
    aircraft.takeoffTime,
    aircraft.ts,
    aircraft.type,
  ]);

  // Calculate display values using useMemo instead of DOM manipulation
  const displayValues = useMemo(() => {
    const altMSL = Number(aircraft.altMSL ?? aircraft.alt ?? 0);
    const speedKts = Number(aircraft.speed ?? 0);

    return {
      altitude: formatAltitude(altMSL, altitudeUnit),
      speed: formatSpeed(speedKts, speedUnit, altMSL),
      vspeed: String(Math.round(Number(aircraft.vspeed ?? 0))),
      heading: `${Math.round(Number(aircraft.heading ?? 0))}°`,
      altAGL: String(Math.round(Number(aircraft.alt ?? 0))),
      squawk: aircraft.squawk ?? "---",
    };
  }, [
    aircraft.alt,
    aircraft.altMSL,
    aircraft.speed,
    aircraft.vspeed,
    aircraft.heading,
    aircraft.squawk,
    speedUnit,
    altitudeUnit,
  ]);

  const currentFlightPhase = useMemo(
    () =>
      getFlightPhase(
        Number(aircraft.alt ?? 0),
        Number(aircraft.vspeed ?? 0),
        aircraft.flightPlan,
      ),
    [aircraft.alt, aircraft.vspeed, aircraft.flightPlan],
  );

  // Get the next waypoint identifier from the aircraft
  const nextWaypointIdent = aircraft.nextWaypoint;
  const flightPlanWaypoints = useMemo(
    () => parseLiveFlightPlanWaypoints(aircraft.flightPlan),
    [aircraft.flightPlan],
  );
  const flightProgress = useMemo(
    () => calculateFlightProgress(aircraft, flightPlanWaypoints),
    [aircraft, flightPlanWaypoints],
  );
  const departureIcao = (aircraft.departure || "").trim().toUpperCase();
  const arrivalIcao = (aircraft.arrival || "").trim().toUpperCase();
  const isClickableAirport = (icao: string) => /^[A-Z0-9]{3,4}$/.test(icao);

  const diversionStatus = useMemo(() => {
    const filedArrival = normalizeAirportCode(aircraft.arrival);
    const plannedArrival = getPlannedDestination(aircraft.flightPlan);

    if (!filedArrival || !plannedArrival) {
      return {
        isDiverting: false,
        hasSignal: false,
        filedArrival: filedArrival ?? "---",
        plannedArrival: plannedArrival ?? "---",
      };
    }

    return {
      isDiverting: plannedArrival !== filedArrival,
      hasSignal: true,
      filedArrival,
      plannedArrival,
    };
  }, [aircraft.arrival, aircraft.flightPlan]);

  const renderFlightPlan = useCallback(() => {
    if (flightPlanWaypoints.length === 0) return null;

    return (
      <div className="mt-6 space-y-2.5">
        <div className="flex items-center gap-2 px-1">
          <div className="h-[1px] flex-1 bg-white/20" />
          <span className="font-mono text-[9px] font-black tracking-[0.3em] text-white/50 uppercase">
            Enroute Path
          </span>
          <div className="h-[1px] flex-1 bg-white/20" />
        </div>
        {flightPlanWaypoints.map((wp: LiveFlightPlanWaypoint, i: number) => {
          const waypointProgress = flightProgress?.waypointEtas[i];
          const isPassed = Boolean(waypointProgress?.isPassed);
          const isActive =
            waypointProgress?.isActive || wp.ident === nextWaypointIdent;
          const hasSpeed =
            wp.spd !== null && wp.spd !== undefined && wp.spd !== "";
          const etaLabel = formatRadarTime(
            waypointProgress?.etaTs,
            timeDisplayMode,
          );
          const distanceLabel = formatEtaCountdown(waypointProgress?.etaTs);
          const isClickable = Boolean(onWaypointClick);

          return (
            <button
              key={i}
              type="button"
              className={`animate-fade-in-up group flex w-full items-center gap-4 rounded-xl border p-3.5 text-left transition ${
                isActive
                  ? "border-green-500/60 bg-green-500/10 shadow-[0_0_12px_rgba(34,197,94,0.2)]"
                  : isPassed
                    ? "border-white/8 bg-black/25"
                    : "border-white/10 bg-black/40 hover:border-cyan-500/40 hover:bg-black/60"
              } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={isClickable ? () => onWaypointClick?.(wp, i) : undefined}
              disabled={!isClickable}
            >
              <div
                className={`font-mono text-xs font-black ${
                  isActive
                    ? "text-green-400"
                    : isPassed
                      ? "text-white/30"
                      : "text-cyan-400"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`truncate font-mono text-sm font-black tracking-wider ${
                      isActive
                        ? "text-green-300"
                        : isPassed
                          ? "text-white/50"
                          : "text-white"
                    }`}
                  >
                    {wp.ident}
                  </span>
                  <span className="font-mono text-[9px] font-bold text-white/40 uppercase">
                    {wp.type}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] font-bold text-white/60">
                  <span>
                    ALT:{" "}
                    <span
                      className={
                        isActive ? "text-green-200/90" : "text-cyan-100/90"
                      }
                    >
                      {wp.alt ?? "---"}
                    </span>
                  </span>
                  {hasSpeed && (
                    <span>
                      SPD:{" "}
                      <span
                        className={
                          isActive ? "text-green-200/90" : "text-cyan-100/90"
                        }
                      >
                        {wp.spd}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              {!isPassed && (
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[9px] font-black tracking-[0.18em] text-white/35 uppercase">
                    ETA
                  </div>
                  <div
                    className={`font-mono text-xs font-black ${
                      isActive ? "text-green-300" : "text-cyan-300"
                    }`}
                  >
                    {etaLabel}
                  </div>
                  {distanceLabel && (
                    <div className="font-mono text-[9px] text-white/35">
                      {distanceLabel}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }, [
    flightPlanWaypoints,
    flightProgress,
    nextWaypointIdent,
    onWaypointClick,
    timeDisplayMode,
  ]);

  const renderHistoryContent = () => (
    <div className="space-y-3">
      {currentFlightHistory && (
        <div
          onClick={() => onHistoryClick?.(currentFlightHistory)}
          className="animate-fade-in-up group relative cursor-pointer overflow-hidden rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 shadow-lg transition-all hover:border-cyan-400/40"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-sm font-black text-white group-hover:text-cyan-300">
              {currentFlightHistory.depICAO} → {currentFlightHistory.arrICAO}
            </span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 font-mono text-[9px] font-black tracking-widest text-cyan-300 uppercase">
              Live
            </span>
          </div>
          <div className="flex items-center gap-2">
            {currentFlightHistory.callsign && (
              <span className="font-mono text-[10px] text-cyan-300/80">
                {currentFlightHistory.callsign}
              </span>
            )}
            {currentFlightHistory.aircraftType && (
              <span className="font-mono text-[10px] text-white/40">
                {currentFlightHistory.aircraftType}
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-[10px] text-white/50">
            Open the route flown so far.
          </p>
        </div>
      )}

      {loadingHistory ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-60">
          <div className="mb-4 h-6 w-6 animate-spin rounded-full border-2 border-cyan-400" />
          <span className="font-mono text-[11px] font-black tracking-widest">
            LOADING
          </span>
        </div>
      ) : canAccessHistory === false ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
            <HistoryIcon size={28} className="text-amber-400" />
          </div>
          <span className="mb-2 font-mono text-sm font-black tracking-wide text-white">
            PRO Feature
          </span>
          <p className="mb-4 max-w-[240px] text-center font-mono text-[10px] leading-relaxed text-white/50">
            Flight history is available for Pro and Admin users only.
          </p>
          <Link
            href="/pricing"
            onClick={() =>
              Analytics.upgradeButtonClicked({
                source: "sidebar_flight_history_locked",
                feature: "flight_history",
              })
            }
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 font-mono text-[10px] font-black tracking-wide text-black transition-all hover:shadow-lg hover:shadow-amber-500/20"
          >
            START 7-DAY TRIAL
          </Link>
        </div>
      ) : history.length === 0 ? (
        <div className="py-20 text-center font-mono text-[10px] tracking-widest text-white/40 uppercase">
          {currentFlightHistory ? "No Past Records" : "No Records"}
        </div>
      ) : (
        history.map((f, histIdx) => (
          <div
            key={f.id}
            onClick={() => {
              if (f.routeData) {
                onHistoryClick?.({
                  id: f.id as string,
                  depICAO: f.depICAO,
                  arrICAO: f.arrICAO,
                  startTime: f.startTime.getTime(),
                  endTime: f.endTime,
                  aircraftType: f.aircraftType,
                  callsign: f.callsign,
                  duration: f.duration,
                  routeData: f.routeData as [number, number][],
                });
              }
            }}
            className="animate-fade-in-up group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 shadow-lg transition-all hover:border-amber-500/40"
            style={{ animationDelay: `${histIdx * 50}ms` }}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-sm font-black text-white group-hover:text-amber-400">
                {f.depICAO} → {f.arrICAO}
              </span>
              <span className="font-mono text-[10px] font-bold text-white/30">
                {new Date(f.startTime).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {f.callsign && (
                <span className="font-mono text-[10px] text-cyan-400/70">
                  {f.callsign}
                </span>
              )}
              {f.aircraftType && (
                <span className="font-mono text-[10px] text-white/40">
                  {f.aircraftType}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const {
    photo: aircraftPhoto,
    virtualAirline,
    loading: aircraftPhotoLoading,
  } = useAircraftPhoto(
    aircraft.flightNo || aircraft.callsign,
    aircraft.type,
    aircraft.googleId,
    aircraft.af,
  );

  // Check if this is the user's own aircraft or if user has special control privileges
  const { googleId: userGoogleId, isLoaded: userLoaded } =
    useCurrentUserProfile();
  const canControlAnyAircraft =
    process.env.NODE_ENV === "development" &&
    userGoogleId === "101233162035372298523";
  const isOwnAircraft =
    userLoaded &&
    (canControlAnyAircraft ||
      (userGoogleId && aircraft.googleId === userGoogleId));

  // Query the pilot's user record for the stats link (with client-side caching)
  const pilotUser = useUserByGoogleId(aircraft.googleId);

  // Reset image loaded state when photo changes
  useEffect(() => {
    setImageLoaded(false);
    setAircraftImageFailed(false);
  }, [aircraft.id, aircraftPhoto?.imageUrl]);

  const hasCommunityImage = Boolean(aircraftPhoto && !aircraftImageFailed);
  const isAircraftImagePending = aircraftPhotoLoading && !aircraftPhoto;
  const isFactoryFallback =
    hasCommunityImage && aircraftPhoto?.source === "factory";
  const radioCallsign = aircraft.telephonyDesignator?.trim();

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col bg-[#050f14]/90 text-white"
    >
      {/* Scrollable content wrapper for mobile */}
      <div
        className={`${isMobile ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "flex min-h-0 flex-1 flex-col overflow-hidden"}`}
      >
        {/* Header with optional aircraft photo background */}
        <div
          className={`relative ${hasCommunityImage || isAircraftImagePending ? (isMobile ? "min-h-[140px]" : "min-h-[200px]") : ""}`}
        >
          {/* Aircraft Photo Background */}
          {hasCommunityImage && (
            <>
              {/* Loading skeleton while image loads */}
              {!imageLoaded && (
                <div className="absolute inset-0 z-0 animate-pulse bg-white/5 motion-reduce:animate-none" />
              )}
              <Image
                src={aircraftPhoto!.imageUrl}
                alt={`${compactAircraftType || aircraft.type || "Aircraft"} in flight`}
                fill
                sizes="(max-width: 768px) 100vw, 420px"
                className={`object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setAircraftImageFailed(true);
                  setImageLoaded(false);
                }}
              />
              {/* Dark gradient overlay for text readability */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050f14] via-[#050f14]/80 to-black/40" />
            </>
          )}

          {isAircraftImagePending && (
            <div className="absolute inset-0 animate-pulse bg-white/5 motion-reduce:animate-none" />
          )}

          {isFactoryFallback && (
            <p className="absolute top-2 left-1/2 z-20 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-md bg-black/50 px-2 py-1 text-center font-mono text-[9px] leading-tight text-white/65 backdrop-blur-sm">
              Factory image shown — upload the airline image at{" "}
              <Link
                href="/aircraft-images"
                className="font-bold text-cyan-300 underline decoration-cyan-300/50 underline-offset-2 transition-colors hover:text-cyan-200 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                /aircraft-images
              </Link>
              .
            </p>
          )}

          {!isAircraftImagePending && !hasCommunityImage && (
            <div
              className={`${isMobile ? "mx-4 mt-3 mb-2 p-3" : "mx-6 mt-4 mb-3 p-3.5"} relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-sky-500/5 to-black/40`}
            >
              <p className="font-mono text-[10px] font-black tracking-[0.18em] text-cyan-300/90 uppercase">
                No Aircraft Image
              </p>
              <p className="mt-0.5 max-w-[280px] font-mono text-[10px] leading-relaxed text-white/60">
                {virtualAirline
                  ? `${virtualAirline.name} has not uploaded a fleet image for this aircraft yet.`
                  : "Help the community identify this aircraft by uploading a photo."}
              </p>
              {!virtualAirline && (
                <Link
                  href="/aircraft-images"
                  className="mt-2 inline-flex font-mono text-[10px] font-black tracking-wide text-cyan-300 underline decoration-cyan-300/50 underline-offset-2 transition-colors hover:text-cyan-200 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                >
                  /aircraft-images
                </Link>
              )}
            </div>
          )}

          {/* Flight Info Overlay */}
          <div
            className={`relative z-10 ${isMobile ? "px-4 pb-2" : "px-6 pb-3"} ${hasCommunityImage || isAircraftImagePending ? (isMobile ? "pt-36" : "pt-40") : ""}`}
          >
            <div className={`${isMobile ? "mb-3" : "mb-2"}`}>
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <h1
                    className={`truncate font-mono leading-none font-black tracking-tighter text-white uppercase drop-shadow-lg ${isMobile ? "text-2xl" : "text-4xl"}`}
                  >
                    {aircraft.flightNo || aircraft.callsign || "N/A"}
                  </h1>
                  {virtualAirline && (
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 font-mono text-[10px] font-black tracking-[0.18em] text-cyan-300 uppercase">
                      VA
                    </span>
                  )}
                </div>
                {radioCallsign && (
                  <p className="mt-1 truncate font-mono text-[10px] font-black tracking-[0.14em] text-cyan-300/85 uppercase drop-shadow-md">
                    {radioCallsign}
                  </p>
                )}
                <p className="truncate font-mono text-[11px] font-black tracking-[0.15em] text-slate-300 uppercase">
                  {compactAircraftType || aircraft.type || "Unknown Class"}
                </p>
                {virtualAirline &&
                  (virtualAirline.website ? (
                    <a
                      href={virtualAirline.website}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block max-w-full truncate font-mono text-[10px] font-bold tracking-[0.14em] text-cyan-300/80 uppercase transition-colors hover:text-cyan-200"
                    >
                      {virtualAirline.name} - {virtualAirline.callsignPrefix}
                    </a>
                  ) : (
                    <p className="mt-1 truncate font-mono text-[10px] font-bold tracking-[0.14em] text-cyan-300/80 uppercase">
                      {virtualAirline.name} - {virtualAirline.callsignPrefix}
                    </p>
                  ))}
                {aircraft.callsign &&
                  (pilotUser ? (
                    <Link
                      data-tour="pilot-profile-link"
                      href={`/pilot/${pilotUser._id}?callsign=${encodeURIComponent(aircraft.callsign)}`}
                      className="mt-1 flex items-center gap-1 font-mono text-[10px] font-bold text-cyan-400 transition-colors hover:text-cyan-300"
                    >
                      <span className="text-white/40">Pilot:</span>{" "}
                      {aircraft.callsign}
                    </Link>
                  ) : (
                    <p className="mt-1 font-mono text-[10px] font-bold text-white/60">
                      <span className="text-white/40">Pilot:</span>{" "}
                      {aircraft.callsign}
                    </p>
                  ))}
              </div>
            </div>
          </div>
        </div>

        <div className={`relative ${isMobile ? "px-4 pb-2" : "px-6 pb-4"}`}>
          {/* Follow + Share buttons */}
          <div
            className="animate-fade-in-up mb-3 flex gap-2"
            style={{ animationDelay: "50ms" }}
          >
            {onToggleFollow && (
              <button
                onClick={onToggleFollow}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 font-mono text-[10px] font-black tracking-wider uppercase transition-all ${
                  isFollowMode
                    ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                    : "border-white/10 bg-black/40 text-white/60 hover:border-cyan-500/30 hover:bg-black/60 hover:text-white"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isFollowMode ? "text-cyan-400" : ""}
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3m0 14v3m10-10h-3M5 12H2m15.5-6.5l-2.1 2.1m-6.8 6.8l-2.1 2.1m0-11l2.1 2.1m6.8 6.8l2.1 2.1" />
                </svg>
                {isFollowMode ? "Following" : "Follow"}
                <span className="text-[8px] text-white/40">(F)</span>
              </button>
            )}

            {(aircraft.callsign || aircraft.flightNo) && (
              <button
                onClick={() => {
                  const identifier = normalizeCallsign(
                    aircraft.flightNo || aircraft.callsign,
                  );
                  const url = `${window.location.origin}/radar?callsign=${identifier}&follow=true`;
                  navigator.clipboard.writeText(url).then(() => {
                    toast.success("Live tracking link copied to clipboard");
                  });
                }}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-[10px] font-black tracking-wider text-white/60 uppercase transition-all hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </button>
            )}
          </div>

          <AcarsPanel googleId={aircraft.googleId} />

          <div
            className="animate-fade-in-up grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-black/40 p-1.5 shadow-inner"
            style={{ animationDelay: "100ms" }}
          >
            <div className="flex flex-col items-center rounded-xl p-3.5">
              <span className="mb-1.5 font-mono text-[9px] font-black text-slate-400 uppercase">
                Altitude
              </span>
              <span className="font-mono text-base leading-none font-black tracking-tight text-white">
                {displayValues.altitude}
              </span>
              <span className="mt-0.5 font-mono text-[8px] font-black tracking-widest text-cyan-400/80 uppercase">
                {altitudeLabel(altitudeUnit)}
              </span>
            </div>
            <div className="z-10 flex scale-105 flex-col items-center rounded-xl border border-white/10 bg-white/10 p-3.5 shadow-lg">
              <PlaneInflightIcon size={20} className="text-cyan-400" />
              <span className="mt-1.5 font-mono text-[10px] font-black tracking-wide text-white uppercase">
                {currentFlightPhase}
              </span>
            </div>
            <div className="flex flex-col items-center rounded-xl p-3.5">
              <span className="mb-1.5 font-mono text-[9px] font-black text-slate-400 uppercase">
                Speed
              </span>
              <span className="font-mono text-base leading-none font-black tracking-tight text-white">
                {displayValues.speed}
              </span>
              <span className="mt-0.5 font-mono text-[8px] font-black tracking-widest text-cyan-400/80 uppercase">
                {speedLabel(speedUnit)}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile: Show control panel and flight plan */}
        {isMobile ? (
          <div className="px-4 pb-6">
            <nav className="mb-4 flex">
              <div className="flex w-full rounded-2xl border border-white/10 bg-black/60 p-1">
                <button
                  onClick={() => setTab("info")}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2 font-mono text-[10px] font-black transition-all ${
                    tab === "info"
                      ? "bg-white text-black shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <InfoCircleIcon size={13} /> LIVE DATA
                </button>
                <button
                  onClick={() => setTab("history")}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2 font-mono text-[10px] font-black transition-all ${
                    tab === "history"
                      ? "bg-white text-black shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <HistoryIcon size={13} /> LOGBOOK
                </button>
              </div>
            </nav>

            {tab === "info" ? (
              <div className="space-y-4">
                {diversionStatus.isDiverting && (
                  <DiversionStatusCard
                    filedArrival={diversionStatus.filedArrival}
                    plannedArrival={diversionStatus.plannedArrival}
                  />
                )}

                {flightProgress && (
                  <FlightTimelineCard
                    progress={flightProgress}
                    distanceLeftNm={aircraft.distanceLeft}
                  />
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <StatBox
                    label="Departure"
                    value={departureIcao || "---"}
                    sub="ORIG"
                    onClick={
                      isClickableAirport(departureIcao) && onAirportClick
                        ? () => onAirportClick(departureIcao)
                        : undefined
                    }
                  />
                  <StatBox
                    label="Arrival"
                    value={arrivalIcao || "---"}
                    sub="DEST"
                    onClick={
                      isClickableAirport(arrivalIcao) && onAirportClick
                        ? () => onAirportClick(arrivalIcao)
                        : undefined
                    }
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-black/30 p-2.5">
                  <MiniStat label="V/S" value={displayValues.vspeed} />
                  <MiniStat label="HDG" value={displayValues.heading} />
                  <MiniStat label="SQWK" value={displayValues.squawk} />
                  <MiniStat label="AGL" value={displayValues.altAGL} />
                </div>

                <AdSenseInContent placement="telemetry" />
                {isOwnAircraft && <AircraftControlPanel aircraft={aircraft} />}
                {renderFlightPlan()}
              </div>
            ) : (
              <div className="pb-2">{renderHistoryContent()}</div>
            )}
          </div>
        ) : (
          <>
            <nav className="mb-5 flex px-6">
              <div className="flex w-full rounded-2xl border border-white/10 bg-black/60 p-1.5 shadow-xl">
                <button
                  onClick={() => setTab("info")}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2.5 font-mono text-[10px] font-black transition-all ${
                    tab === "info"
                      ? "bg-white text-black shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <InfoCircleIcon size={14} /> LIVE DATA
                </button>
                <button
                  onClick={() => setTab("history")}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2.5 font-mono text-[10px] font-black transition-all ${
                    tab === "history"
                      ? "bg-white text-black shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <HistoryIcon size={14} /> LOGBOOK
                </button>
              </div>
            </nav>

            <div className="custom-scrollbar flex-1 overflow-y-auto px-6 pb-12">
              {tab === "info" ? (
                <div className="space-y-6">
                  {diversionStatus.isDiverting && (
                    <DiversionStatusCard
                      filedArrival={diversionStatus.filedArrival}
                      plannedArrival={diversionStatus.plannedArrival}
                    />
                  )}
                  {flightProgress && (
                    <FlightTimelineCard
                      progress={flightProgress}
                      distanceLeftNm={aircraft.distanceLeft}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-3.5">
                    <StatBox
                      label="Departure"
                      value={departureIcao || "---"}
                      sub="ORIG"
                      delay={0}
                      onClick={
                        isClickableAirport(departureIcao) && onAirportClick
                          ? () => onAirportClick(departureIcao)
                          : undefined
                      }
                    />
                    <StatBox
                      label="Arrival"
                      value={arrivalIcao || "---"}
                      sub="DEST"
                      delay={1}
                      onClick={
                        isClickableAirport(arrivalIcao) && onAirportClick
                          ? () => onAirportClick(arrivalIcao)
                          : undefined
                      }
                    />
                    <StatBox
                      label="V-Speed"
                      value={displayValues.vspeed}
                      sub="FPM"
                      delay={2}
                    />
                    <StatBox
                      label="Heading"
                      value={displayValues.heading}
                      sub="MAG"
                      delay={3}
                    />
                    <StatBox
                      label="Squawk"
                      value={displayValues.squawk}
                      sub="XPDR"
                      delay={4}
                    />
                    <StatBox
                      label="Alt AGL"
                      value={displayValues.altAGL}
                      sub="FEET"
                      delay={5}
                    />
                  </div>
                  <AdSenseInContent placement="telemetry" />
                  {isOwnAircraft && (
                    <AircraftControlPanel aircraft={aircraft} />
                  )}
                  {renderFlightPlan()}
                </div>
              ) : (
                renderHistoryContent()
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StatBox = ({
  label,
  value,
  sub,
  delay = 0,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  delay?: number;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`animate-fade-in-up group rounded-2xl border border-white/10 bg-black/40 p-4 text-left shadow-lg transition-all hover:bg-black/60 ${
      onClick ? "cursor-pointer hover:border-cyan-500/40" : "cursor-default"
    }`}
    style={{ animationDelay: `${150 + delay * 50}ms` }}
    disabled={!onClick}
  >
    <div className="mb-2 font-mono text-[9px] font-black tracking-[0.2em] text-slate-400 uppercase transition-colors group-hover:text-cyan-400/80">
      {label}
    </div>
    <div className="flex items-baseline gap-1.5">
      <div className="truncate font-mono text-lg font-black tracking-tighter text-white">
        {value}
      </div>
      <span className="font-mono text-[9px] font-black tracking-tighter text-cyan-400 uppercase opacity-80">
        {sub}
      </span>
    </div>
  </button>
);

const DiversionStatusCard = ({
  filedArrival,
  plannedArrival,
}: {
  filedArrival: string;
  plannedArrival: string;
}) => (
  <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-lg">
    <div className="font-mono text-[9px] font-black tracking-[0.2em] text-amber-300 uppercase">
      Diversion Status
    </div>
    <div className="mt-1 font-mono text-sm font-black text-amber-200">
      DIVERTING
    </div>
    <p className="mt-1 font-mono text-[10px] text-white/60">
      Filed ARR {filedArrival} • Plan DST {plannedArrival}
    </p>
  </div>
);

const FlightTimelineCard = ({
  progress,
  distanceLeftNm,
}: {
  progress: FlightProgressSnapshot;
  distanceLeftNm?: number | null;
}) => {
  const { timeDisplayMode } = useTimeDisplayPreference();
  const roundedDistanceLeftNm = Number.isFinite(distanceLeftNm)
    ? Math.round(distanceLeftNm ?? 0)
    : null;

  return (
    <div
      className="animate-fade-in-up rounded-2xl border border-white/10 bg-black/40 p-4 shadow-lg"
      style={{ animationDelay: "120ms" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[9px] font-black tracking-[0.2em] text-slate-400 uppercase">
          Flight Timeline
        </span>
        <span className="font-mono text-[10px] font-black text-cyan-400">
          {Math.max(0, Math.min(100, progress.progressPercent))}%
        </span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400 transition-all duration-500"
          style={{
            width: `${Math.max(0, Math.min(100, progress.progressPercent))}%`,
          }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="font-mono text-[9px] tracking-wider text-white/40 uppercase">
            Departure
          </div>
          <div className="font-mono text-sm font-black text-white">
            {formatRadarTime(progress.departureTimeTs, timeDisplayMode)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] tracking-wider text-white/40 uppercase">
            Est. Arrival
          </div>
          <div className="font-mono text-sm font-black text-white">
            {formatRadarTime(progress.arrivalEtaTs, timeDisplayMode)}
          </div>
        </div>
      </div>

      <div className="mt-2 text-center font-mono text-[11px] text-white/50">
        {roundedDistanceLeftNm !== null ? (
          <>
            <span className="text-cyan-300">{roundedDistanceLeftNm} NM</span> in{" "}
            <span className="text-cyan-300">
              {formatDuration(progress.remainingMinutes)}
            </span>
          </>
        ) : (
          <>
            Remaining:{" "}
            <span className="text-cyan-300">
              {formatDuration(progress.remainingMinutes)}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-center">
    <div className="font-mono text-[8px] font-black tracking-wider text-slate-400 uppercase">
      {label}
    </div>
    <div className="mt-0.5 truncate font-mono text-[10px] font-black text-white">
      {value}
    </div>
  </div>
);
