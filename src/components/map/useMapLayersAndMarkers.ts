// components/map/useMapLayersAndMarkers.ts
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { type PositionUpdate } from "~/lib/aircraft-store";
import { type Airport } from "~/components/map"; // Adjusted path
import { type OnlineAirport } from "~/hooks/useAircraftStream";
import { type Runway } from "~/hooks/useAirportData";
import { preparePathForWorldCopy } from "~/lib/map-utils";
import {
  RADAR_TRAIL_COLOR,
  buildRadarModeLinePath,
  buildRadarTrailDots,
} from "~/lib/radarTrails";
import {
  type RadarModeLinePreferences,
  type RadarTrailPreferences,
} from "~/lib/radarTrailPreferences";
import {
  preloadAircraftIcons,
  getAircraftDivIcon,
  getRadarAircraftDivIcon,
  AirportIcon,
  RadarAirportIcon,
} from "./MapIcons";
import { useUnitPreferences } from "~/hooks/useUnitPreferences";
import {
  buildRunwayCenterlinePaths,
  RUNWAY_CENTERLINE_MIN_ZOOM,
  type RunwayCenterlinePreferences,
} from "~/lib/runwayCenterlines";

// Track active animations to cancel them when new position arrives
const activeAnimations = new Map<L.Marker, number>();

// Track animation target destinations to avoid restarting animations on re-renders
const animationTargets = new Map<L.Marker, { lat: number; lng: number }>();

// Track last update time per marker to measure actual update intervals
const lastUpdateTimes = new Map<L.Marker, number>();

// Track whether the map is currently zooming - pause all marker DOM mutations during zoom
let isZooming = false;

// Cancel all running animations without touching marker positions (used on zoomstart).
// Leaflet's CSS zoom transform will handle visual scaling — calling setLatLng here
// would fight with that transform and cause jumping.
function cancelAllAnimations() {
  activeAnimations.forEach((frameId) => cancelAnimationFrame(frameId));
  activeAnimations.clear();
}

// Track tab visibility - skip animation when returning from hidden
let wasTabHidden = false;
let skipNextAnimation = false;

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      wasTabHidden = true;
    } else if (wasTabHidden) {
      // Tab just became visible after being hidden - skip animation for next update
      skipNextAnimation = true;
      wasTabHidden = false;
      // Reset flag after a short delay to allow normal animation to resume
      setTimeout(() => {
        skipNextAnimation = false;
      }, 100);
    }
  });
}

// Smoothly animate marker to new position (or jump if returning from hidden tab)
function slideTo(marker: L.Marker, destLat: number, destLng: number) {
  // Cancel any existing animation for this marker
  const existingAnimation = activeAnimations.get(marker);
  if (existingAnimation) {
    cancelAnimationFrame(existingAnimation);
    activeAnimations.delete(marker);
  }

  // Store the target destination
  animationTargets.set(marker, { lat: destLat, lng: destLng });

  // If map is zooming, don't animate or call setLatLng — Leaflet's
  // CSS zoom transform handles visual positioning during zoom.
  // The target is stored above so the next post-zoom update picks it up.
  if (isZooming) {
    return;
  }

  // Measure actual interval between position updates to use as animation duration
  const now = performance.now();
  const lastUpdate = lastUpdateTimes.get(marker);
  lastUpdateTimes.set(marker, now);
  const duration = lastUpdate ? Math.min(now - lastUpdate, 10000) : 3000;

  // If returning from hidden tab, jump directly to position
  if (skipNextAnimation) {
    marker.setLatLng([destLat, destLng]);
    return;
  }

  const start = performance.now();
  const startLat = marker.getLatLng().lat;
  const startLng = marker.getLatLng().lng;
  const deltaLat = destLat - startLat;
  const deltaLng = destLng - startLng;

  function animate(currentTime: number) {
    // If zoom started mid-animation, stop — don't call setLatLng during zoom
    if (isZooming) {
      activeAnimations.delete(marker);
      return;
    }

    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);

    // Linear interpolation for constant speed movement
    const newLat = startLat + deltaLat * progress;
    const newLng = startLng + deltaLng * progress;

    marker.setLatLng([newLat, newLng]);

    if (progress < 1) {
      const frameId = requestAnimationFrame(animate);
      activeAnimations.set(marker, frameId);
    } else {
      activeAnimations.delete(marker);
    }
  }

  const frameId = requestAnimationFrame(animate);
  activeAnimations.set(marker, frameId);
}

interface UseMapLayersAndMarkersProps {
  mapInstance: React.MutableRefObject<L.Map | null>;
  radarTrailsLayer: React.MutableRefObject<L.LayerGroup | null>;
  radarModeLineLayer: React.MutableRefObject<L.LayerGroup | null>;
  runwayCenterlineLayer: React.MutableRefObject<L.LayerGroup | null>;
  aircraftMarkersLayer: React.MutableRefObject<L.LayerGroup | null>;
  airportMarkersLayer: React.MutableRefObject<L.LayerGroup | null>;
  osmLayer: React.MutableRefObject<L.TileLayer | null>;
  satelliteHybridLayer: React.MutableRefObject<L.TileLayer | null>;
  radarBaseLayer: React.MutableRefObject<L.TileLayer | null>;
  openAIPLayer: React.MutableRefObject<L.TileLayer | null>;
  aircrafts: PositionUpdate[];
  airports: Airport[];
  runways: Runway[];
  onlineAirports?: OnlineAirport[];
  isOSMMode: boolean;
  isRadarMode: boolean;
  isOpenAIPEnabled: boolean;
  selectedAircraftIds: string[];
  selectedAirport?: Airport;
  onAircraftSelect: (
    aircraft: PositionUpdate | null,
    ctrlKey?: boolean,
  ) => void;
  onAirportSelect?: (airport: Airport) => void;
  showTags: boolean;
  radarTrailPreferences: RadarTrailPreferences;
  radarModeLinePreferences: RadarModeLinePreferences;
  runwayCenterlinePreferences: RunwayCenterlinePreferences;
  showConflicts: boolean;
  onConflictsChange?: (conflicts: ConflictAlertSummary[]) => void;
  onInitialTrafficPaint?: () => void;
  mapReady: boolean;
  isMobile: boolean;
}

type ConflictSeverity = "high" | "medium" | "low";

interface ConflictAlert {
  aircraftA: PositionUpdate;
  aircraftB: PositionUpdate;
  horizontalSeparationNm: number;
  verticalSeparationFt: number;
  timeToCpaMinutes: number;
  severity: ConflictSeverity;
  cpaMidpoint: [number, number];
}

export interface ConflictAlertSummary {
  id: string;
  aircraftIdA: string;
  aircraftIdB: string;
  callsignA: string;
  callsignB: string;
  severity: ConflictSeverity;
  horizontalSeparationNm: number;
  verticalSeparationFt: number;
  timeToCpaMinutes: number;
}

const NM_PER_DEG_LAT = 60;
const LOOKAHEAD_MINUTES = 6;
const TERMINAL_LOOKAHEAD_MINUTES = 3;
const MAX_INITIAL_DISTANCE_NM = 30;
const HORIZONTAL_THRESHOLD_NM = 3;
const VERTICAL_THRESHOLD_FT = 1200;
const MAX_DISPLAYED_CONFLICTS = 40;
const SURFACE_ALTITUDE_FT = 150;
const SURFACE_SPEED_KTS = 70;
const TERMINAL_ALTITUDE_FT = 1800;
const TERMINAL_SPEED_KTS = 180;
const TERMINAL_HORIZONTAL_THRESHOLD_NM = 1.5;
const TERMINAL_VERTICAL_THRESHOLD_FT = 700;
const SAME_FLOW_HEADING_DELTA_DEG = 18;
const SAME_FLOW_RELATIVE_SPEED_NM_PER_MIN = 2;
const EMERGENCY_SQUAWKS = new Set(["7700", "7600", "7500"]);

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function getSpeedKts(aircraft: PositionUpdate) {
  return Math.max(0, toFiniteNumber(aircraft.speed, 0));
}

function getVelocityVectorNmPerMinute(aircraft: PositionUpdate) {
  const speedKts = getSpeedKts(aircraft);
  const headingRad = toRadians(toFiniteNumber(aircraft.heading, 0));
  const speedNmPerMinute = speedKts / 60;

  return {
    east: speedNmPerMinute * Math.sin(headingRad),
    north: speedNmPerMinute * Math.cos(headingRad),
  };
}

function getAltitudeAglFt(aircraft: PositionUpdate) {
  return Math.max(0, toFiniteNumber(aircraft.alt, 0));
}

function getVerticalTrend(aircraft: PositionUpdate) {
  const verticalSpeed = toFiniteNumber(aircraft.vspeed, 0);
  if (verticalSpeed >= 400) return "climb";
  if (verticalSpeed <= -400) return "descent";
  return "level";
}

function getHeadingDeltaDegrees(
  aircraftA: PositionUpdate,
  aircraftB: PositionUpdate,
) {
  const delta = Math.abs(
    toFiniteNumber(aircraftA.heading, 0) - toFiniteNumber(aircraftB.heading, 0),
  );
  return delta > 180 ? 360 - delta : delta;
}

function isSurfaceTraffic(aircraft: PositionUpdate) {
  return (
    getAltitudeAglFt(aircraft) <= SURFACE_ALTITUDE_FT &&
    getSpeedKts(aircraft) <= SURFACE_SPEED_KTS
  );
}

function isTerminalTraffic(aircraft: PositionUpdate) {
  return (
    getAltitudeAglFt(aircraft) <= TERMINAL_ALTITUDE_FT ||
    getSpeedKts(aircraft) <= TERMINAL_SPEED_KTS
  );
}

function isSameFlowPair(aircraftA: PositionUpdate, aircraftB: PositionUpdate) {
  const headingDelta = getHeadingDeltaDegrees(aircraftA, aircraftB);
  if (headingDelta > SAME_FLOW_HEADING_DELTA_DEG) return false;

  const trendA = getVerticalTrend(aircraftA);
  const trendB = getVerticalTrend(aircraftB);
  if (trendA !== trendB) return false;

  const nextWaypointA = aircraftA.nextWaypoint?.trim().toUpperCase();
  const nextWaypointB = aircraftB.nextWaypoint?.trim().toUpperCase();
  if (nextWaypointA && nextWaypointB && nextWaypointA === nextWaypointB) {
    return true;
  }

  const sameArrival =
    aircraftA.arrival &&
    aircraftB.arrival &&
    aircraftA.arrival === aircraftB.arrival &&
    trendA === "descent";
  const sameDeparture =
    aircraftA.departure &&
    aircraftB.departure &&
    aircraftA.departure === aircraftB.departure &&
    trendA === "climb";

  return Boolean(
    (aircraftA.navMode &&
      aircraftB.navMode &&
      (sameArrival || sameDeparture)) ||
    sameArrival ||
    sameDeparture,
  );
}

function getRelativeOffsetNm(
  from: PositionUpdate,
  to: PositionUpdate,
): { east: number; north: number; cosLat: number } {
  const avgLatRad = toRadians((from.lat + to.lat) / 2);
  const cosLat = Math.max(0.2, Math.cos(avgLatRad));

  return {
    east: (to.lon - from.lon) * NM_PER_DEG_LAT * cosLat,
    north: (to.lat - from.lat) * NM_PER_DEG_LAT,
    cosLat,
  };
}

function getConflictSeverity(
  horizontalSeparationNm: number,
  verticalSeparationFt: number,
): ConflictSeverity {
  if (horizontalSeparationNm <= 1.2 && verticalSeparationFt <= 700) {
    return "high";
  }
  if (horizontalSeparationNm <= 2 && verticalSeparationFt <= 1000) {
    return "medium";
  }
  return "low";
}

function getConflictStyle(severity: ConflictSeverity) {
  if (severity === "high") {
    return { color: "#ef4444", weight: 3, radius: 7 };
  }
  if (severity === "medium") {
    return { color: "#f59e0b", weight: 2.5, radius: 6 };
  }
  return { color: "#facc15", weight: 2, radius: 5 };
}

function getRadarLineStyle(
  aircraft: PositionUpdate,
  isSelected: boolean,
): { color: string; opacity: number; weight: number } {
  const isEmergency = aircraft.squawk && EMERGENCY_SQUAWKS.has(aircraft.squawk);

  if (isEmergency) {
    return {
      color: "#ef4444",
      opacity: isSelected ? 0.95 : 0.8,
      weight: isSelected ? 2.6 : 1.7,
    };
  }

  if (isSelected) {
    return {
      color: "#4ade80",
      opacity: 0.95,
      weight: 2.4,
    };
  }

  return {
    color: "#22d3ee",
    opacity: 0.72,
    weight: 1.5,
  };
}

function detectConflicts(aircrafts: PositionUpdate[]): ConflictAlert[] {
  const conflicts: ConflictAlert[] = [];

  for (let i = 0; i < aircrafts.length; i++) {
    const aircraftA = aircrafts[i];
    if (!aircraftA) continue;
    if (isSurfaceTraffic(aircraftA)) continue;

    const velocityA = getVelocityVectorNmPerMinute(aircraftA);
    const altitudeA = toFiniteNumber(aircraftA.altMSL ?? aircraftA.alt, 0);
    const vSpeedA = toFiniteNumber(aircraftA.vspeed, 0) / 60;

    for (let j = i + 1; j < aircrafts.length; j++) {
      const aircraftB = aircrafts[j];
      if (!aircraftB) continue;
      if (isSurfaceTraffic(aircraftB)) continue;

      const offset = getRelativeOffsetNm(aircraftA, aircraftB);
      const currentHorizontalNm = Math.hypot(offset.east, offset.north);

      if (currentHorizontalNm > MAX_INITIAL_DISTANCE_NM) {
        continue;
      }

      const velocityB = getVelocityVectorNmPerMinute(aircraftB);
      const relativeVelocityEast = velocityB.east - velocityA.east;
      const relativeVelocityNorth = velocityB.north - velocityA.north;
      const relativeVelocitySquared =
        relativeVelocityEast * relativeVelocityEast +
        relativeVelocityNorth * relativeVelocityNorth;
      const relativeSpeedNmPerMinute = Math.sqrt(relativeVelocitySquared);
      const sameFlowPair = isSameFlowPair(aircraftA, aircraftB);
      const terminalPair =
        isTerminalTraffic(aircraftA) || isTerminalTraffic(aircraftB);
      const lookaheadMinutes = terminalPair
        ? TERMINAL_LOOKAHEAD_MINUTES
        : LOOKAHEAD_MINUTES;

      if (
        sameFlowPair &&
        relativeSpeedNmPerMinute <= SAME_FLOW_RELATIVE_SPEED_NM_PER_MIN &&
        currentHorizontalNm > TERMINAL_HORIZONTAL_THRESHOLD_NM
      ) {
        continue;
      }

      let timeToCpa = 0;
      if (relativeVelocitySquared > 1e-8) {
        timeToCpa =
          -(
            offset.east * relativeVelocityEast +
            offset.north * relativeVelocityNorth
          ) / relativeVelocitySquared;
      }
      timeToCpa = Math.min(Math.max(timeToCpa, 0), lookaheadMinutes);

      const cpaEast = offset.east + relativeVelocityEast * timeToCpa;
      const cpaNorth = offset.north + relativeVelocityNorth * timeToCpa;
      const horizontalSeparationNm = Math.hypot(cpaEast, cpaNorth);
      const horizontalThresholdNm = terminalPair
        ? TERMINAL_HORIZONTAL_THRESHOLD_NM
        : HORIZONTAL_THRESHOLD_NM;

      if (horizontalSeparationNm > horizontalThresholdNm) {
        continue;
      }

      const altitudeB = toFiniteNumber(aircraftB.altMSL ?? aircraftB.alt, 0);
      const vSpeedB = toFiniteNumber(aircraftB.vspeed, 0) / 60;
      const verticalSeparationFt = Math.abs(
        altitudeB + vSpeedB * timeToCpa - (altitudeA + vSpeedA * timeToCpa),
      );
      const verticalThresholdFt = terminalPair
        ? TERMINAL_VERTICAL_THRESHOLD_FT
        : VERTICAL_THRESHOLD_FT;

      if (verticalSeparationFt > verticalThresholdFt) {
        continue;
      }

      const aircraftAXAtCpa = velocityA.east * timeToCpa;
      const aircraftAYAtCpa = velocityA.north * timeToCpa;
      const aircraftBXAtCpa = offset.east + velocityB.east * timeToCpa;
      const aircraftBYAtCpa = offset.north + velocityB.north * timeToCpa;
      const midpointEast = (aircraftAXAtCpa + aircraftBXAtCpa) / 2;
      const midpointNorth = (aircraftAYAtCpa + aircraftBYAtCpa) / 2;
      const cpaLat = aircraftA.lat + midpointNorth / NM_PER_DEG_LAT;
      const cpaLon =
        aircraftA.lon + midpointEast / (NM_PER_DEG_LAT * offset.cosLat);

      conflicts.push({
        aircraftA,
        aircraftB,
        horizontalSeparationNm,
        verticalSeparationFt,
        timeToCpaMinutes: timeToCpa,
        severity: getConflictSeverity(
          horizontalSeparationNm,
          verticalSeparationFt,
        ),
        cpaMidpoint: [cpaLat, cpaLon],
      });
    }
  }

  return conflicts.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return a.horizontalSeparationNm - b.horizontalSeparationNm;
  });
}

export const useMapLayersAndMarkers = ({
  mapInstance,
  radarTrailsLayer,
  radarModeLineLayer,
  runwayCenterlineLayer,
  aircraftMarkersLayer,
  airportMarkersLayer,
  osmLayer,
  satelliteHybridLayer,
  radarBaseLayer,
  openAIPLayer,
  aircrafts,
  airports,
  runways,
  onlineAirports,
  isOSMMode,
  isRadarMode,
  isOpenAIPEnabled,
  selectedAircraftIds,
  selectedAirport,
  onAircraftSelect,
  onAirportSelect,
  showTags,
  radarTrailPreferences,
  radarModeLinePreferences,
  runwayCenterlinePreferences,
  showConflicts,
  onConflictsChange,
  onInitialTrafficPaint,
  mapReady,
  isMobile,
}: UseMapLayersAndMarkersProps) => {
  const { speedUnit, altitudeUnit } = useUnitPreferences();
  const [viewportRevision, setViewportRevision] = useState(0);

  // Track existing markers by aircraft ID for smooth updates
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const conflictLayerRef = useRef<L.LayerGroup | null>(null);
  const radarTrailRendererRef = useRef<L.Renderer | null>(null);
  const hasReportedInitialTrafficPaintRef = useRef(false);
  const [areAircraftIconsReady, setAreAircraftIconsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void preloadAircraftIcons()
      .then(() => {
        if (!cancelled) setAreAircraftIconsReady(true);
      })
      .catch(() => {
        // A failed asset is covered by the page's boot timeout.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Use refs for callbacks to avoid stale closures in event handlers
  const onAircraftSelectRef = useRef(onAircraftSelect);
  const aircraftsRef = useRef(aircrafts);

  useEffect(() => {
    onAircraftSelectRef.current = onAircraftSelect;
  }, [onAircraftSelect]);

  useEffect(() => {
    aircraftsRef.current = aircrafts;
  }, [aircrafts]);

  // Pause marker animations during zoom to prevent jitter
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const onZoomStart = () => {
      isZooming = true;
      cancelAllAnimations();
    };
    const onZoomEnd = () => {
      isZooming = false;
    };

    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);

    return () => {
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
    };
  }, [mapInstance]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;

    if (!radarTrailRendererRef.current) {
      radarTrailRendererRef.current = L.canvas({ padding: 0.25 });
    }

    if (!conflictLayerRef.current) {
      conflictLayerRef.current = L.layerGroup().addTo(map);
    }

    return () => {
      if (!conflictLayerRef.current) return;
      map.removeLayer(conflictLayerRef.current);
      conflictLayerRef.current = null;
    };
  }, [mapInstance, mapReady]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;

    const updateViewportRevision = () => {
      setViewportRevision((current) => current + 1);
    };

    map.on("moveend", updateViewportRevision);
    map.on("zoomend", updateViewportRevision);

    return () => {
      map.off("moveend", updateViewportRevision);
      map.off("zoomend", updateViewportRevision);
    };
  }, [mapInstance, mapReady]);

  useEffect(() => {
    const trailLayer = radarTrailsLayer.current;
    const renderer = radarTrailRendererRef.current;
    if (!trailLayer || !renderer || !mapReady) return;

    trailLayer.clearLayers();
    if (!isRadarMode || !radarTrailPreferences.enabled) return;

    aircrafts.forEach((aircraft) => {
      const dots = buildRadarTrailDots(aircraft, radarTrailPreferences);
      if (dots.length === 0) return;

      const displayDots = preparePathForWorldCopy(
        dots.map((dot) => [dot.lat, dot.lon] as [number, number]),
        aircraft.lon,
      );

      displayDots.forEach(([lat, lon], index) => {
        const dot = dots[index];
        if (!dot) return;

        L.circleMarker([lat, lon], {
          radius: dot.radius,
          color: RADAR_TRAIL_COLOR,
          weight: 1,
          opacity: dot.opacity,
          fillColor: RADAR_TRAIL_COLOR,
          fillOpacity: dot.opacity * 0.35,
          interactive: false,
          renderer,
        }).addTo(trailLayer);
      });
    });
  }, [
    aircrafts,
    isRadarMode,
    mapReady,
    radarTrailsLayer,
    radarTrailPreferences,
  ]);

  useEffect(() => {
    const lineLayer = radarModeLineLayer.current;
    const renderer = radarTrailRendererRef.current;
    if (!lineLayer || !renderer || !mapReady) return;

    lineLayer.clearLayers();
    if (!isRadarMode || !radarModeLinePreferences.enabled) return;

    const selectedIdsSet = new Set(selectedAircraftIds);

    aircrafts.forEach((aircraft) => {
      const linePath = buildRadarModeLinePath(
        aircraft,
        radarModeLinePreferences,
      );
      if (linePath.length < 2) return;

      const displayPath = preparePathForWorldCopy(linePath, aircraft.lon);
      const aircraftKey = aircraft.callsign || aircraft.id;
      const style = getRadarLineStyle(
        aircraft,
        selectedIdsSet.has(aircraftKey),
      );

      L.polyline(displayPath, {
        color: style.color,
        opacity: style.opacity,
        weight: style.weight,
        interactive: false,
        renderer,
      }).addTo(lineLayer);
    });
  }, [
    aircrafts,
    isRadarMode,
    mapReady,
    radarModeLineLayer,
    radarModeLinePreferences,
    selectedAircraftIds,
  ]);

  useEffect(() => {
    const map = mapInstance.current;
    const centerlineLayer = runwayCenterlineLayer.current;
    const renderer = radarTrailRendererRef.current;
    if (!map || !centerlineLayer || !renderer || !mapReady) return;

    centerlineLayer.clearLayers();
    if (!isRadarMode || !runwayCenterlinePreferences.enabled) return;
    if (map.getZoom() < RUNWAY_CENTERLINE_MIN_ZOOM) {
      return;
    }

    const bounds = map.getBounds().pad(0.25);

    runways.forEach((runway) => {
      const displayPaths = buildRunwayCenterlinePaths(
        runway,
        runwayCenterlinePreferences,
      ).map((path, index) => {
        const referenceLon = index === 0 ? runway.leLon : runway.heLon;
        return preparePathForWorldCopy(path, referenceLon);
      });
      const hasVisibleCenterline = displayPaths.some((displayPath) => {
        if (displayPath.some((point) => bounds.contains(point))) return true;
        return L.latLngBounds(displayPath).intersects(bounds);
      });

      if (!hasVisibleCenterline) return;

      displayPaths.forEach((displayPath) => {
        L.polyline(displayPath, {
          color: "#f8fafc",
          opacity: 0.45,
          weight: 1.2,
          dashArray: "7, 9",
          interactive: false,
          renderer,
        }).addTo(centerlineLayer);
      });
    });
  }, [
    isRadarMode,
    mapInstance,
    mapReady,
    runwayCenterlineLayer,
    runwayCenterlinePreferences,
    runways,
    viewportRevision,
  ]);

  // Effect for managing base layers (OSM/Satellite/Radar)
  useEffect(() => {
    if (
      !mapInstance.current ||
      !osmLayer.current ||
      !satelliteHybridLayer.current ||
      !radarBaseLayer.current
    )
      return;

    const map = mapInstance.current;

    // Remove all base layers first
    if (map.hasLayer(osmLayer.current)) {
      map.removeLayer(osmLayer.current);
    }
    if (map.hasLayer(satelliteHybridLayer.current)) {
      map.removeLayer(satelliteHybridLayer.current);
    }
    if (map.hasLayer(radarBaseLayer.current)) {
      map.removeLayer(radarBaseLayer.current);
    }

    // Add the appropriate base layer
    if (isRadarMode) {
      map.addLayer(radarBaseLayer.current);
    } else if (isOSMMode) {
      map.addLayer(osmLayer.current);
    } else {
      map.addLayer(satelliteHybridLayer.current);
    }
  }, [
    mapInstance,
    isOSMMode,
    isRadarMode,
    osmLayer,
    satelliteHybridLayer,
    radarBaseLayer,
  ]);

  // Effect for managing OpenAIP layer
  useEffect(() => {
    if (!mapInstance.current || !openAIPLayer.current) return;

    if (isOpenAIPEnabled) {
      if (!mapInstance.current.hasLayer(openAIPLayer.current)) {
        mapInstance.current.addLayer(openAIPLayer.current);
      }
      openAIPLayer.current.bringToFront();
    } else {
      if (mapInstance.current.hasLayer(openAIPLayer.current)) {
        mapInstance.current.removeLayer(openAIPLayer.current);
      }
    }
  }, [mapInstance, isOpenAIPEnabled, openAIPLayer]);

  // Clear markers when layer reference changes
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      markers.clear();
    };
  }, [aircraftMarkersLayer]);

  // Effect for managing aircraft markers with smooth animation
  useEffect(() => {
    if (!aircraftMarkersLayer.current || !mapReady) return;

    let animationFrameId: number | null = null;

    const currentAircraftIds = new Set(
      aircrafts.map((ac) => ac.callsign || ac.id),
    );
    const existingMarkers = markersRef.current;

    // Remove markers for aircraft that are no longer present
    existingMarkers.forEach((marker, id) => {
      if (!currentAircraftIds.has(id)) {
        aircraftMarkersLayer.current!.removeLayer(marker);
        existingMarkers.delete(id);
      }
    });

    // Convert selectedAircraftIds to a Set for O(1) lookup
    const selectedIdsSet = new Set(selectedAircraftIds);

    // Update or create markers for each aircraft
    aircrafts.forEach((aircraft) => {
      const id = aircraft.callsign || aircraft.id;
      // Pass the first selected ID for backwards compatibility with icon rendering
      // The icon will be highlighted if this aircraft's ID is in the set
      const isSelected = selectedIdsSet.has(id);
      const selectedIdForIcon = isSelected ? id : null;
      const unitPrefs = { speedUnit, altitudeUnit };
      const icon = isRadarMode
        ? getRadarAircraftDivIcon(
            aircraft,
            selectedIdForIcon,
            showTags,
            isMobile,
            unitPrefs,
          )
        : getAircraftDivIcon(
            aircraft,
            selectedIdForIcon,
            showTags,
            isMobile,
            unitPrefs,
          );

      const existingMarker = existingMarkers.get(id);

      if (existingMarker) {
        // Update existing marker - animate to new position
        const newLat = aircraft.lat;
        const newLng = aircraft.lon;

        // Only start a new animation if the TARGET destination changed
        // (not the current mid-animation position, which would restart animations on re-renders)
        const currentTarget = animationTargets.get(existingMarker);
        if (
          !currentTarget ||
          Math.abs(currentTarget.lat - newLat) > 0.0001 ||
          Math.abs(currentTarget.lng - newLng) > 0.0001
        ) {
          if (isRadarMode) {
            const existingAnimation = activeAnimations.get(existingMarker);
            if (existingAnimation) {
              cancelAnimationFrame(existingAnimation);
              activeAnimations.delete(existingMarker);
            }
            animationTargets.set(existingMarker, { lat: newLat, lng: newLng });
            existingMarker.setLatLng([newLat, newLng]);
          } else {
            slideTo(existingMarker, newLat, newLng);
          }
        }

        // Skip icon updates during zoom — setIcon() destroys and recreates the
        // marker's DOM element, which conflicts with Leaflet's CSS zoom transform
        // and causes markers to visually jump. Icons refresh on the next SSE update
        // after zoom ends.
        if (!isZooming) {
          existingMarker.setIcon(icon);
        }
      } else {
        // Create new marker
        const marker = L.marker([aircraft.lat, aircraft.lon], {
          title: aircraft.callsign,
          icon: icon,
          zIndexOffset: 1000,
        }).addTo(aircraftMarkersLayer.current!);

        // Store the aircraft ID for lookup in click handler
        const aircraftId = id;
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          const ctrlKey =
            e.originalEvent?.ctrlKey || e.originalEvent?.metaKey || false;
          // Get the latest aircraft data from the ref
          const currentAircraft = aircraftsRef.current.find(
            (ac) => (ac.callsign || ac.id) === aircraftId,
          );
          if (currentAircraft) {
            onAircraftSelectRef.current(currentAircraft, ctrlKey);
          }
        });

        existingMarkers.set(id, marker);
      }
    });

    // Note: Flight path redrawing for selected aircraft is handled by the parent
    // component (page.tsx) which properly redraws all selected aircraft paths
    // when aircraft data updates. Redrawing here would cause flickering in
    // multi-select mode since it would only redraw one aircraft's path.
    if (areAircraftIconsReady && !hasReportedInitialTrafficPaintRef.current) {
      animationFrameId = requestAnimationFrame(() => {
        hasReportedInitialTrafficPaintRef.current = true;
        onInitialTrafficPaint?.();
      });
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    aircrafts,
    isRadarMode,
    selectedAircraftIds,
    aircraftMarkersLayer,
    onAircraftSelect,
    showTags,
    mapReady,
    isMobile,
    onInitialTrafficPaint,
    areAircraftIconsReady,
    speedUnit,
    altitudeUnit,
  ]);

  useEffect(() => {
    const conflictLayer = conflictLayerRef.current;
    if (!conflictLayer) return;

    conflictLayer.clearLayers();
    if (!showConflicts || !mapReady) {
      onConflictsChange?.([]);
      return;
    }

    const conflicts = detectConflicts(aircrafts).slice(
      0,
      MAX_DISPLAYED_CONFLICTS,
    );
    onConflictsChange?.(
      conflicts.map((conflict) => ({
        id: `${conflict.aircraftA.id}-${conflict.aircraftB.id}`,
        aircraftIdA: conflict.aircraftA.id,
        aircraftIdB: conflict.aircraftB.id,
        callsignA:
          conflict.aircraftA.callsign ||
          conflict.aircraftA.flightNo ||
          conflict.aircraftA.id,
        callsignB:
          conflict.aircraftB.callsign ||
          conflict.aircraftB.flightNo ||
          conflict.aircraftB.id,
        severity: conflict.severity,
        horizontalSeparationNm: conflict.horizontalSeparationNm,
        verticalSeparationFt: conflict.verticalSeparationFt,
        timeToCpaMinutes: conflict.timeToCpaMinutes,
      })),
    );

    conflicts.forEach((conflict) => {
      const style = getConflictStyle(conflict.severity);

      L.polyline(
        [
          [conflict.aircraftA.lat, conflict.aircraftA.lon],
          [conflict.aircraftB.lat, conflict.aircraftB.lon],
        ],
        {
          color: style.color,
          weight: style.weight,
          opacity: 0.65,
          dashArray: "5, 7",
          interactive: false,
        },
      ).addTo(conflictLayer);

      L.circleMarker(conflict.cpaMidpoint, {
        radius: style.radius,
        color: style.color,
        fillColor: style.color,
        fillOpacity: 0.35,
        weight: 1.5,
        interactive: false,
      })
        .addTo(conflictLayer)
        .bindTooltip(
          `CPA ${conflict.horizontalSeparationNm.toFixed(1)}nm / ${Math.round(conflict.verticalSeparationFt)}ft in ${conflict.timeToCpaMinutes.toFixed(1)}m`,
          {
            direction: "top",
            opacity: 0.95,
          },
        );
    });
  }, [aircrafts, mapReady, onConflictsChange, showConflicts]);

  // Use refs for callbacks to avoid stale closures
  const onAirportSelectRef = useRef(onAirportSelect);
  useEffect(() => {
    onAirportSelectRef.current = onAirportSelect;
  }, [onAirportSelect]);

  // Effect for managing airport markers with zoom-based visibility
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !airportMarkersLayer.current) return;

    // Inject pulse animation CSS once
    if (!document.getElementById("online-atc-pulse-style")) {
      const style = document.createElement("style");
      style.id = "online-atc-pulse-style";
      style.textContent = `
        @keyframes atc-pulse {
          0%, 100% { box-shadow: 0 0 6px rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 14px rgba(34, 197, 94, 0.8); }
        }
      `;
      document.head.appendChild(style);
    }

    const onlineIcaoSet = new Set((onlineAirports || []).map((a) => a.icao));
    const onlineByIcao = new Map(
      (onlineAirports || []).map((a) => [a.icao, a]),
    );

    const updateAirportMarkers = () => {
      if (!airportMarkersLayer.current) return;

      const currentZoom = map.getZoom();
      const shouldShowAllAirports = currentZoom >= 8; // Only show regular airports when zoomed in

      // Clear existing markers
      airportMarkersLayer.current.clearLayers();

      // Get map bounds to only show airports in view (performance optimization)
      const bounds = map.getBounds();

      // Always render online ATC airports that aren't in the airports list
      // (they might not be fetched yet or not in the OurAirports dataset)
      const renderedIcaos = new Set<string>();

      airports.forEach((airport) => {
        const isOnline = onlineIcaoSet.has(airport.icao);

        // Skip non-online airports when zoomed out or outside view
        if (
          !isOnline &&
          (!shouldShowAllAirports ||
            !bounds.contains([airport.lat, airport.lon]))
        )
          return;
        // Skip online airports outside view
        if (isOnline && !bounds.contains([airport.lat, airport.lon])) return;

        renderedIcaos.add(airport.icao);

        const isSelected = selectedAirport?.icao === airport.icao;
        const onlineEntry = onlineByIcao.get(airport.icao);

        // Color scheme: green for online ATC, cyan/blue for normal
        let bgColor: string;
        let borderColor: string;
        let boxShadow: string;

        if (isOnline) {
          bgColor = "#22c55e";
          borderColor = isSelected ? "#22c55e" : "rgba(34, 197, 94, 0.5)";
          boxShadow = isSelected
            ? "0 0 14px rgba(34, 197, 94, 0.7)"
            : "0 0 6px rgba(34, 197, 94, 0.4); animation: atc-pulse 2s ease-in-out infinite";
        } else if (isSelected) {
          bgColor = isRadarMode ? "#22d3ee" : "#3b82f6";
          borderColor = isRadarMode ? "#22d3ee" : "#3b82f6";
          boxShadow = "0 0 12px rgba(34, 211, 238, 0.6)";
        } else {
          bgColor = isRadarMode ? "#06b6d4" : "#60a5fa";
          borderColor = isRadarMode
            ? "rgba(6, 182, 212, 0.4)"
            : "rgba(96, 165, 250, 0.4)";
          boxShadow = "0 0 6px rgba(6, 182, 212, 0.3)";
        }

        const dotSize = isSelected || isOnline ? "12px" : "8px";
        const iconDim = isSelected || isOnline ? 16 : 12;
        const anchorDim = isSelected || isOnline ? 8 : 6;

        // Create custom icon based on selection state
        const icon = L.divIcon({
          className: "custom-airport-marker",
          html: `
            <div style="
              width: ${dotSize};
              height: ${dotSize};
              background-color: ${bgColor};
              border: 2px solid ${borderColor};
              border-radius: 50%;
              box-shadow: ${boxShadow};
              transition: all 0.2s ease;
            "></div>
          `,
          iconSize: [iconDim, iconDim],
          iconAnchor: [anchorDim, anchorDim],
        });

        let popupContent = `
          <div style="color: ${isRadarMode ? "#00ffff" : "#333"}; background-color: ${
            isRadarMode ? "rgba(0,0,0,0.8)" : "white"
          }; border: ${isRadarMode ? "1px solid #00ffff" : "none"}; padding: 4px;">
            <strong style="color: ${
              isRadarMode ? "#00ffff" : "#333"
            };">Airport:</strong> ${airport.name}<br>(${airport.icao})
          </div>
        `;

        if (airport.frequencies && airport.frequencies.length > 0) {
          popupContent += `
            <div style="margin-top: 8px;">
              <strong style="color: ${
                isRadarMode ? "#99ff99" : "#333"
              };">Frequencies:</strong><br>
              <ul style="list-style-type: none; padding: 0; margin: 0;">
          `;
          airport.frequencies.forEach((freq) => {
            popupContent += `
                <li style="font-size: 12px; margin-bottom: 2px;">
                  <span style="color: ${
                    isRadarMode ? "#00ffff" : "#666"
                  };">${freq.type}:</span>
                  <span style="font-weight: bold; color: ${
                    isRadarMode ? "#fff" : "#333"
                  };">${freq.frequency} MHz</span>
                </li>
            `;
          });
          popupContent += `
              </ul>
            </div>
          `;
        }

        const marker = L.marker([airport.lat, airport.lon], {
          title: airport.name,
          icon: icon,
        })
          .addTo(airportMarkersLayer.current!)
          .bindPopup(popupContent, {
            className: isRadarMode ? "radar-popup" : "",
          });

        // Bind hover tooltip for online ATC airports
        if (isOnline && onlineEntry) {
          const tooltipText =
            onlineEntry.controllers.length === 1
              ? `ATC Online — ${onlineEntry.controllers[0]!.user}`
              : onlineEntry.controllers
                  .map(
                    (c) =>
                      `${c.position.charAt(0).toUpperCase() + c.position.slice(1)}: ${c.user}`,
                  )
                  .join(" | ");
          marker.bindTooltip(tooltipText, {
            direction: "top",
            offset: [0, -10],
            opacity: 0.95,
            className: "atc-online-tooltip",
          });
        }

        // Add click handler to select airport
        marker.on("click", () => {
          if (onAirportSelectRef.current) {
            onAirportSelectRef.current(airport);
          }
        });
      });
    };

    // Update markers on mount and when dependencies change
    updateAirportMarkers();

    // Update markers when zoom changes
    map.on("zoomend", updateAirportMarkers);
    map.on("moveend", updateAirportMarkers);

    return () => {
      map.off("zoomend", updateAirportMarkers);
      map.off("moveend", updateAirportMarkers);
    };
  }, [
    airports,
    isRadarMode,
    airportMarkersLayer,
    mapInstance,
    selectedAirport,
    onlineAirports,
  ]);
};
