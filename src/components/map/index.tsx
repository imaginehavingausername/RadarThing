"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import L from "leaflet";
import { useAltitudeOverlay } from "./useAltitudeOverlay";
import { liveAltitudeTrack, type AltitudeTrack } from "~/lib/altitude3d";

import "leaflet/dist/leaflet.css";
import { toast } from "sonner";

import { type PositionUpdate } from "~/lib/aircraft-store";
import { type OnlineAirport } from "~/hooks/useAircraftStream";
import { type Runway } from "~/hooks/useAirportData";
import { preparePathForWorldCopy } from "~/lib/map-utils";
import { type ImportedFlightPlan } from "~/lib/flightPlanImport";
import { useMobileDetection } from "~/hooks/useMobileDetection";
import { useProStatus } from "~/hooks/useProStatus";
import { getBooleanCookie, setBooleanCookie } from "~/lib/cookies";
import {
  ALTITUDE_RENDER_BANDS,
  buildAltitudePathSegments,
} from "~/lib/altitudeBands";
import { buildAltitudeProfile } from "~/lib/altitudeProfile";
import { type FlightRoutePoint } from "~/lib/flightTelemetry";

import { useMapInitialization } from "./useMapInitialization";
import { useFlightPlanDrawing } from "./useFlightPlanDrawing";
import { useMapLayersAndMarkers } from "./useMapLayersAndMarkers";
import { type ConflictAlertSummary } from "./useMapLayersAndMarkers";
import { useSelectedAirportHandling } from "./useSelectedAirportHandling";
import { useHeadingModeInteraction } from "./useHeadingModeInteraction";

import {
  HeadingModeControl,
  RadarModeControl,
  OSMControl,
  OpenAIPControl,
  RadarSettingsControl,
} from "~/components/map/MapControls";

import { getReplayAircraftIcon } from "~/components/map/MapIcons";

import { MapGlobalStyles } from "~/styles/MapGlobalStyles";
import { useMetarOverlay } from "~/hooks/useMetarOverlay";
import { useAtisOverlay } from "~/hooks/useAtisOverlay";
import { useNotamOverlay } from "~/hooks/useNotamOverlay";
import { useWeatherOverlayLayer } from "~/hooks/useWeatherOverlayLayer";
import { useWaypointOverlayLayer } from "~/hooks/useWaypointOverlayLayer";
import { MetarPanel } from "./MetarPanel";
import { RadarSettings } from "~/components/atc/radarSettings";
import { MapSettingsSidebar } from "~/components/map/MapSettingsSidebar";
import { Analytics } from "~/lib/analytics";
import {
  createMapLayerPreset,
  getStoredMapLayerPresets,
  mapLayerPresetStateEquals,
  setStoredMapLayerPresets,
  type MapBaseLayer,
  type MapLayerPresetState,
} from "~/lib/mapLayerPresets";
import {
  getStoredRadarModeLinePreferences,
  getStoredRadarTrailPreferences,
  setStoredRadarModeLinePreferences,
  setStoredRadarTrailPreferences,
} from "~/lib/radarTrailPreferences";
import {
  getStoredRunwayCenterlinePreferences,
  setStoredRunwayCenterlinePreferences,
} from "~/lib/runwayCenterlinePreferences";
import {
  shouldIgnoreRadarShortcut,
  type RadarKeybindPreferences,
} from "~/lib/radarKeybindPreferences";

export interface Airport {
  name: string;
  lat: number;
  lon: number;
  icao: string;
  frequencies?: { type: string; frequency: string }[];
}

interface ReplayState {
  currentPosition: [number, number] | null;
  currentHeading: number;
  traversedPath: [number, number][];
  remainingPath: [number, number][];
  traversedAltitudes: number[];
  remainingAltitudes: number[];
  currentAltitude: number;
  maxAltitude: number;
  altitudeIsEstimated: boolean;
  isPlaying: boolean;
}

interface AltitudePolylineLayers {
  segments: L.Polyline[];
}

function clearAltitudePolylines(
  group: L.LayerGroup,
  layers: React.MutableRefObject<AltitudePolylineLayers>,
) {
  for (const layer of layers.current.segments) {
    group.removeLayer(layer);
  }
  layers.current = { segments: [] };
}

function renderAltitudePolylines(
  group: L.LayerGroup,
  layers: React.MutableRefObject<AltitudePolylineLayers>,
  path: [number, number][],
  altitudes: number[],
  options: L.PolylineOptions,
) {
  const segments = buildAltitudePathSegments(path, altitudes);

  segments.forEach((segment, index) => {
    const style = {
      ...options,
      color: ALTITUDE_RENDER_BANDS[segment.bandIndex]!.color,
    };
    const existing = layers.current.segments[index];
    if (existing) {
      existing.setLatLngs(segment.points).setStyle(style).bringToFront();
    } else {
      layers.current.segments[index] = L.polyline(segment.points, style).addTo(
        group,
      );
      layers.current.segments[index]?.bringToFront();
    }
  });

  for (
    let index = layers.current.segments.length - 1;
    index >= segments.length;
    index -= 1
  ) {
    const layer = layers.current.segments[index];
    if (layer) group.removeLayer(layer);
    layers.current.segments.pop();
  }
}

interface ConflictHistoryEvent extends ConflictAlertSummary {
  eventKey: string;
  createdAt: number;
  lastSeenAt: number;
}

const EMPTY_LIVE_AIRCRAFTS: PositionUpdate[] = [];

interface MapComponentProps {
  aircrafts: PositionUpdate[];
  airports: Airport[];
  runways?: Runway[];
  onlineAirports?: OnlineAirport[];
  isMobile?: boolean;
  onAircraftSelect: (
    aircraft: PositionUpdate | null,
    ctrlKey?: boolean,
  ) => void;
  onAirportSelect?: (airport: Airport) => void;
  selectedAircraftIds?: string[];
  selectedAirport?: Airport;
  setDrawFlightPlanOnMap: (
    func: (aircraft: PositionUpdate, shouldZoom?: boolean) => void,
  ) => void;
  setDrawMultipleFlightPlansOnMap?: (
    func: (aircrafts: PositionUpdate[], shouldZoom?: boolean) => void,
  ) => void;
  onMapReady?: () => void;
  onInitialBaseLayerReady?: () => void;
  onInitialTrafficPaint?: () => void;
  onWeatherReadyChange?: (ready: boolean) => void;
  historyPath?: FlightRoutePoint[] | null;
  onLayerModeChange?: (isDarkLayer: boolean) => void;
  replayState?: ReplayState | null;
  followAircraft?: PositionUpdate;
  onConflictReview?: (aircrafts: PositionUpdate[]) => void;
  onResetMapView?: () => void;
  hideUi?: boolean;
  importedFlightPlan?: ImportedFlightPlan | null;
  flightDisplayModeRequest?: FlightDisplayMode;
  onFlightDisplayModeChange?: (mode: FlightDisplayMode) => void;
  headingModeEnabled?: boolean;
  onHeadingModeChange?: (enabled: boolean) => void;
  keybindPreferences: RadarKeybindPreferences;
  onKeybindPreferencesChange: (preferences: RadarKeybindPreferences) => void;
}

const MAX_CONFLICT_HISTORY = 12;

export type FlightDisplayMode =
  | "default"
  | "labels-hidden"
  | "waypoints-hidden"
  | "minimal";

const FLIGHT_DISPLAY_MODES: FlightDisplayMode[] = [
  "default",
  "labels-hidden",
  "waypoints-hidden",
  "minimal",
];

const MapComponent: React.FC<MapComponentProps> = ({
  aircrafts,
  airports,
  runways = [],
  onlineAirports,
  isMobile: isMobileProp,
  onAircraftSelect,
  onAirportSelect,
  selectedAircraftIds = [],
  selectedAirport,
  setDrawFlightPlanOnMap,
  setDrawMultipleFlightPlansOnMap,
  onMapReady,
  onInitialBaseLayerReady,
  onInitialTrafficPaint,
  onWeatherReadyChange,
  historyPath,
  onLayerModeChange,
  replayState,
  followAircraft,
  onConflictReview,
  onResetMapView,
  hideUi = false,
  importedFlightPlan = null,
  flightDisplayModeRequest,
  onFlightDisplayModeChange,
  headingModeEnabled,
  onHeadingModeChange,
  keybindPreferences,
  onKeybindPreferencesChange,
}) => {
  const detectedIsMobile = useMobileDetection();
  const isMobile = isMobileProp ?? detectedIsMobile;
  const { isProUser, isLoading: proLoading } = useProStatus();

  const canUseRadarMode = isProUser;
  const canUseAdvancedWeather = isProUser;
  const canUseConflictAlerts = isProUser;

  const [isAltitude3D, setIsAltitude3D] = useState(false);
  const [isHeadingMode, setIsHeadingMode] = useState(false);
  const [isRadarMode, setIsRadarMode] = useState(() =>
    getBooleanCookie("map_radar_mode", false),
  );
  const [isOSMMode, setIsOSMMode] = useState(() =>
    getBooleanCookie("map_osm_mode", false),
  );
  const [isOpenAIPEnabled, setIsOpenAIPEnabled] = useState(() =>
    getBooleanCookie("map_openaip", false),
  );
  const [showWaypoints, setShowWaypoints] = useState(() =>
    getBooleanCookie("map_waypoints", false),
  );

  const [showPrecipitation, setShowPrecipitation] = useState(() =>
    getBooleanCookie("weather_precipitation", false),
  );
  const [showAirmets, setShowAirmets] = useState(() =>
    getBooleanCookie("weather_airmets", false),
  );
  const [showSigmets, setShowSigmets] = useState(() =>
    getBooleanCookie("weather_sigmets", false),
  );
  const [showConflicts, setShowConflicts] = useState(() =>
    getBooleanCookie("traffic_conflicts", false),
  );
  const [layerPresets, setLayerPresets] = useState(() =>
    getStoredMapLayerPresets(),
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [flightDisplayMode, setFlightDisplayMode] =
    useState<FlightDisplayMode>("default");
  const showTags =
    flightDisplayMode === "default" || flightDisplayMode === "waypoints-hidden";
  const showFlightPlanWaypoints =
    flightDisplayMode === "default" || flightDisplayMode === "labels-hidden";
  const [radarTrailPreferences, setRadarTrailPreferences] = useState(() =>
    getStoredRadarTrailPreferences(),
  );
  const [radarModeLinePreferences, setRadarModeLinePreferences] = useState(() =>
    getStoredRadarModeLinePreferences(),
  );
  const [runwayCenterlinePreferences, setRunwayCenterlinePreferences] =
    useState(() => getStoredRunwayCenterlinePreferences());
  const [conflictAlerts, setConflictAlerts] = useState<ConflictAlertSummary[]>(
    [],
  );
  const [conflictHistory, setConflictHistory] = useState<
    ConflictHistoryEvent[]
  >([]);
  const lastConflictSnapshotRef = useRef<string>("");
  const lastConflictHistorySignatureRef = useRef<string>("");
  const replayTraversedAltitudePolylinesRef = useRef<AltitudePolylineLayers>({
    segments: [],
  });
  const replayRemainingAltitudePolylinesRef = useRef<AltitudePolylineLayers>({
    segments: [],
  });
  const replayMarkerRef = useRef<L.Marker | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Local selection state for internal use (cleared when clicking map background)
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>([]);
  const hasReportedInitialBaseLayerRef = useRef(false);

  const [icaoInput, setIcaoInput] = useState("");

  useEffect(() => {
    if (flightDisplayModeRequest) {
      setFlightDisplayMode(flightDisplayModeRequest);
    }
  }, [flightDisplayModeRequest]);

  useEffect(() => {
    onFlightDisplayModeChange?.(flightDisplayMode);
  }, [flightDisplayMode, onFlightDisplayModeChange]);

  useEffect(() => {
    if (headingModeEnabled !== undefined) {
      setIsHeadingMode(headingModeEnabled);
    }
  }, [headingModeEnabled]);

  useEffect(() => {
    onHeadingModeChange?.(isHeadingMode);
  }, [isHeadingMode, onHeadingModeChange]);

  const headingControlRef = useRef<HeadingModeControl | null>(null);
  const radarControlRef = useRef<RadarModeControl | null>(null);
  const osmControlRef = useRef<OSMControl | null>(null);
  const openAIPControlRef = useRef<OpenAIPControl | null>(null);
  const settingsControlRef = useRef<RadarSettingsControl | null>(null);

  const onAircraftSelectRef = useRef(onAircraftSelect);
  useEffect(() => {
    onAircraftSelectRef.current = onAircraftSelect;
  }, [onAircraftSelect]);

  useEffect(() => {
    if (!isMobile || selectedAircraftIds.length > 0) return;
    setIsSettingsOpen(false);
  }, [isMobile, selectedAircraftIds]);

  const clearHistoryPolylineRef = useRef<(() => void) | null>(null);
  const clearFlightPlansRef = useRef<(() => void) | null>(null);

  const handleResetMapView = useCallback(() => {
    clearFlightPlansRef.current?.();
    onResetMapView?.();
  }, [onResetMapView]);

  const currentLayerState = useMemo<MapLayerPresetState>(
    () => ({
      baseLayer: isRadarMode ? "radar" : isOSMMode ? "osm" : "satellite",
      openAIP: isOpenAIPEnabled,
      runwayCenterlines: runwayCenterlinePreferences.enabled,
      waypoints: showWaypoints,
      precipitation: showPrecipitation,
      airmets: showAirmets,
      sigmets: showSigmets,
      conflicts: showConflicts,
    }),
    [
      isOpenAIPEnabled,
      isOSMMode,
      isRadarMode,
      runwayCenterlinePreferences.enabled,
      showWaypoints,
      showAirmets,
      showConflicts,
      showPrecipitation,
      showSigmets,
    ],
  );

  const liveAircrafts = useMemo(
    () => (replayState ? EMPTY_LIVE_AIRCRAFTS : aircrafts),
    [aircrafts, replayState],
  );

  const activePreset = useMemo(
    () =>
      layerPresets.find((preset) =>
        mapLayerPresetStateEquals(preset, currentLayerState),
      ) ?? null,
    [currentLayerState, layerPresets],
  );

  const selectedPreset = useMemo(
    () =>
      selectedPresetId
        ? (layerPresets.find((preset) => preset.id === selectedPresetId) ??
          null)
        : null,
    [layerPresets, selectedPresetId],
  );

  useEffect(() => {
    setStoredMapLayerPresets(layerPresets);
  }, [layerPresets]);

  useEffect(() => {
    setSelectedPresetId((current) => {
      if (activePreset?.id) {
        return activePreset.id;
      }

      if (current && layerPresets.some((preset) => preset.id === current)) {
        return current;
      }

      return null;
    });
  }, [activePreset, layerPresets]);

  const applyBaseLayer = useCallback((baseLayer: MapBaseLayer) => {
    setIsRadarMode(baseLayer === "radar");
    setIsOSMMode(baseLayer === "osm");
  }, []);

  const toggleRadarMode = useCallback(() => {
    if (!canUseRadarMode) return;
    setIsRadarMode((prev) => {
      if (!prev) {
        // Enabling radar mode - disable OSM (base layers are mutually exclusive)
        setIsOSMMode(false);
      }
      return !prev;
    });
  }, [canUseRadarMode]);

  const toggleOSMMode = useCallback(() => {
    setIsOSMMode((prev) => {
      if (!prev) {
        // Enabling OSM mode - disable radar (base layers are mutually exclusive)
        setIsRadarMode(false);
      }
      return !prev;
    });
  }, []);

  const toggleOpenAIPMode = useCallback(() => {
    // OpenAIP is an overlay that can be shown on top of any base layer
    setIsOpenAIPEnabled((prev) => !prev);
  }, []);

  const applyLayerPreset = useCallback(
    (presetId: string) => {
      const preset = layerPresets.find((entry) => entry.id === presetId);
      if (!preset) return;

      const skipped: string[] = [];
      let nextBaseLayer = preset.baseLayer;
      let nextAirmets = preset.airmets;
      let nextSigmets = preset.sigmets;
      let nextConflicts = preset.conflicts;
      let nextRunwayCenterlines = preset.runwayCenterlines ?? false;

      if (preset.baseLayer === "radar" && !canUseRadarMode) {
        skipped.push("Radar Mode");
        nextBaseLayer = "satellite";
      }
      if (preset.airmets && !canUseAdvancedWeather) {
        skipped.push("AIRMETs");
        nextAirmets = false;
      }
      if (preset.sigmets && !canUseAdvancedWeather) {
        skipped.push("SIGMETs");
        nextSigmets = false;
      }
      if (preset.conflicts && !canUseConflictAlerts) {
        skipped.push("Conflict Alerts");
        nextConflicts = false;
      }
      if (nextRunwayCenterlines && !canUseRadarMode) {
        skipped.push("Runway Centerlines");
        nextRunwayCenterlines = false;
      }

      setBooleanCookie("map_radar_mode", nextBaseLayer === "radar");
      setBooleanCookie("map_osm_mode", nextBaseLayer === "osm");
      setBooleanCookie("map_openaip", preset.openAIP);
      setRunwayCenterlinePreferences((currentPreferences) =>
        setStoredRunwayCenterlinePreferences({
          ...currentPreferences,
          enabled: nextRunwayCenterlines,
        }),
      );
      setBooleanCookie("map_waypoints", preset.waypoints ?? false);
      setBooleanCookie("weather_precipitation", preset.precipitation);
      setBooleanCookie("weather_airmets", nextAirmets);
      setBooleanCookie("weather_sigmets", nextSigmets);
      setBooleanCookie("traffic_conflicts", nextConflicts);

      applyBaseLayer(nextBaseLayer);
      setIsOpenAIPEnabled(preset.openAIP);
      setShowWaypoints(preset.waypoints ?? false);
      setShowPrecipitation(preset.precipitation);
      setShowAirmets(nextAirmets);
      setShowSigmets(nextSigmets);
      setShowConflicts(nextConflicts);
      setSelectedPresetId(preset.id);
      Analytics.track("map_layer_preset_applied", {
        preset_id: preset.id,
        preset_name: preset.name,
        skipped_count: skipped.length,
      });

      if (skipped.length > 0) {
        toast.warning(
          `Applied ${preset.name} with ${skipped.join(", ")} skipped`,
        );
      }
    },
    [
      applyBaseLayer,
      canUseAdvancedWeather,
      canUseConflictAlerts,
      canUseRadarMode,
      layerPresets,
    ],
  );

  const saveLayerPreset = useCallback(
    (name: string) => {
      const normalizedName = name.trim();
      if (!normalizedName) {
        return { ok: false as const, error: "Preset name is required" };
      }

      if (normalizedName.length > 32) {
        return {
          ok: false as const,
          error: "Preset names must be 32 characters or fewer",
        };
      }

      const hasNameConflict = layerPresets.some(
        (preset) => preset.name.toLowerCase() === normalizedName.toLowerCase(),
      );
      if (hasNameConflict) {
        return {
          ok: false as const,
          error: "A preset with that name already exists",
        };
      }

      const duplicateState = layerPresets.find((preset) =>
        mapLayerPresetStateEquals(preset, currentLayerState),
      );
      if (duplicateState) {
        return {
          ok: false as const,
          error: `Current setup already matches ${duplicateState.name}`,
        };
      }

      const preset = createMapLayerPreset(normalizedName, currentLayerState);
      setLayerPresets((prev) =>
        [...prev, preset].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setSelectedPresetId(preset.id);
      Analytics.track("map_layer_preset_saved", {
        preset_id: preset.id,
        preset_name: preset.name,
      });
      toast.success(`Saved preset: ${preset.name}`);
      return { ok: true as const };
    },
    [currentLayerState, layerPresets],
  );

  const updateLayerPreset = useCallback(
    (presetId: string) => {
      const preset = layerPresets.find((entry) => entry.id === presetId);
      if (!preset) return;

      setLayerPresets((prev) =>
        prev.map((entry) =>
          entry.id === presetId
            ? {
                ...entry,
                ...currentLayerState,
                updatedAt: Date.now(),
              }
            : entry,
        ),
      );
      setSelectedPresetId(presetId);
      Analytics.track("map_layer_preset_updated", {
        preset_id: preset.id,
        preset_name: preset.name,
      });
      toast.success(`Updated preset: ${preset.name}`);
    },
    [currentLayerState, layerPresets],
  );

  const deleteLayerPreset = useCallback(
    (presetId: string) => {
      const preset = layerPresets.find((entry) => entry.id === presetId);
      if (!preset) return;

      setLayerPresets((prev) => prev.filter((entry) => entry.id !== presetId));
      setSelectedPresetId((current) => (current === presetId ? null : current));
      Analytics.track("map_layer_preset_deleted", {
        preset_id: preset.id,
        preset_name: preset.name,
      });
      toast.success(`Deleted preset: ${preset.name}`);
    },
    [layerPresets],
  );

  useEffect(() => {
    // Only reset when loading is complete and user doesn't have access
    if (!proLoading && !canUseRadarMode && isRadarMode) {
      setIsRadarMode(false);
    }
  }, [proLoading, canUseRadarMode, isRadarMode]);

  useEffect(() => {
    // Only reset when loading is complete and user doesn't have access
    if (!proLoading && !canUseAdvancedWeather) {
      setShowAirmets(false);
      setShowSigmets(false);
    }
  }, [proLoading, canUseAdvancedWeather]);

  useEffect(() => {
    // Only reset when loading is complete and user doesn't have access
    if (!proLoading && !canUseConflictAlerts && showConflicts) {
      setShowConflicts(false);
    }
  }, [proLoading, canUseConflictAlerts, showConflicts]);

  // Persist map mode settings to cookies
  useEffect(() => {
    setBooleanCookie("map_radar_mode", isRadarMode);
  }, [isRadarMode]);

  useEffect(() => {
    setBooleanCookie("map_osm_mode", isOSMMode);
  }, [isOSMMode]);

  useEffect(() => {
    setBooleanCookie("map_openaip", isOpenAIPEnabled);
  }, [isOpenAIPEnabled]);

  useEffect(() => {
    setBooleanCookie("map_waypoints", showWaypoints);
  }, [showWaypoints]);

  // Persist weather layer settings to cookies
  useEffect(() => {
    setBooleanCookie("weather_precipitation", showPrecipitation);
  }, [showPrecipitation]);

  useEffect(() => {
    setBooleanCookie("weather_airmets", showAirmets);
  }, [showAirmets]);

  useEffect(() => {
    setBooleanCookie("weather_sigmets", showSigmets);
  }, [showSigmets]);

  useEffect(() => {
    setBooleanCookie("traffic_conflicts", showConflicts);
  }, [showConflicts]);

  useEffect(() => {
    if (!showConflicts) return;
    Analytics.conflictMonitorViewed();
  }, [showConflicts]);

  useEffect(() => {
    if (!showConflicts) {
      lastConflictSnapshotRef.current = "";
      return;
    }

    const high = conflictAlerts.filter((a) => a.severity === "high").length;
    const medium = conflictAlerts.filter((a) => a.severity === "medium").length;
    const low = conflictAlerts.filter((a) => a.severity === "low").length;
    const snapshot = `${conflictAlerts.length}:${high}:${medium}:${low}`;

    if (snapshot === lastConflictSnapshotRef.current) return;
    lastConflictSnapshotRef.current = snapshot;

    Analytics.conflictSnapshotUpdated({
      total: conflictAlerts.length,
      high,
      medium,
      low,
    });
  }, [conflictAlerts, showConflicts]);

  useEffect(() => {
    if (!showConflicts) {
      lastConflictHistorySignatureRef.current = "";
      return;
    }

    const signature = conflictAlerts
      .map(
        (alert) =>
          `${alert.id}:${alert.severity}:${Math.round(alert.horizontalSeparationNm * 10)}:${Math.round(alert.verticalSeparationFt)}:${Math.round(alert.timeToCpaMinutes * 10)}`,
      )
      .join("|");

    if (signature === lastConflictHistorySignatureRef.current) return;
    lastConflictHistorySignatureRef.current = signature;

    if (conflictAlerts.length === 0) return;

    const now = Date.now();
    setConflictHistory((prev) => {
      const nextByKey = new Map<string, ConflictHistoryEvent>(
        prev.map((event) => [event.eventKey, event] as const),
      );

      conflictAlerts.forEach((alert) => {
        const lookupKey = alert.id;
        const existing = nextByKey.get(lookupKey);
        nextByKey.set(lookupKey, {
          ...(existing ?? {
            ...alert,
            eventKey: alert.id,
            createdAt: now,
            lastSeenAt: now,
          }),
          ...alert,
          eventKey: alert.id,
          lastSeenAt: now,
        });
      });

      return Array.from(nextByKey.values())
        .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
        .slice(0, MAX_CONFLICT_HISTORY);
    });
  }, [conflictAlerts, showConflicts]);

  const handleClearConflictEvents = useCallback(() => {
    setConflictHistory([]);
  }, []);

  const handleReviewConflictEvent = useCallback(
    (event: ConflictHistoryEvent | ConflictAlertSummary) => {
      if (!onConflictReview) return;

      const reviewAircraft = aircrafts.filter(
        (aircraft) =>
          aircraft.id === event.aircraftIdA ||
          aircraft.id === event.aircraftIdB ||
          aircraft.callsign === event.callsignA ||
          aircraft.callsign === event.callsignB ||
          aircraft.flightNo === event.callsignA ||
          aircraft.flightNo === event.callsignB,
      );

      const uniqueAircraft = Array.from(
        new Map(
          reviewAircraft.map((aircraft) => [
            aircraft.callsign || aircraft.id,
            aircraft,
          ]),
        ).values(),
      ).slice(0, 2);

      if (uniqueAircraft.length === 0) {
        toast.error("This event is not tied to live traffic right now");
        return;
      }

      onConflictReview(uniqueAircraft);
      Analytics.track("conflict_event_reviewed", {
        event_id: event.id,
        severity: event.severity,
        tracked_count: uniqueAircraft.length,
      });
    },
    [aircrafts, onConflictReview],
  );

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const target = e.originalEvent.target as HTMLElement;

      if (
        target.closest(".leaflet-marker-icon") ||
        target.closest(".leaflet-control") ||
        target.closest(".leaflet-popup-pane")
      ) {
        return;
      }

      mapRefs.flightPlanLayerGroup.current?.clearLayers();
      mapRefs.historyLayerGroup.current?.clearLayers();
      clearHistoryPolylineRef.current?.();

      currentSelectedAircraftRef.current = null;
      setLocalSelectedIds([]);

      onAircraftSelectRef.current(null);
      setIsSettingsOpen(false);
    },
    // These refs are stable and don't need to trigger re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleMapClick({
          originalEvent: {
            target: document.createElement("div"),
          },
        } as unknown as L.LeafletMouseEvent);
      }

      if (shouldIgnoreRadarShortcut(e, document.activeElement)) return;

      if (e.code === keybindPreferences.cycleDisplay) {
        e.preventDefault();
        setFlightDisplayMode((currentMode) => {
          const currentIndex = FLIGHT_DISPLAY_MODES.indexOf(currentMode);
          const nextMode =
            FLIGHT_DISPLAY_MODES[
              (currentIndex + 1) % FLIGHT_DISPLAY_MODES.length
            ]!;
          return nextMode;
        });
      }
      if (!hideUi && e.code === keybindPreferences.headingMode) {
        e.preventDefault();
        setIsHeadingMode(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleMapClick, hideUi, keybindPreferences]);

  useEffect(() => {
    if (!hideUi) return;

    setIsHeadingMode(false);
    setIsSettingsOpen(false);
  }, [hideUi]);

  const mapRefs = useMapInitialization({
    mapContainerId: "map-container",
    setIsHeadingMode,
    setIsRadarMode: toggleRadarMode,
    setIsOSMMode: toggleOSMMode,
    setIsOpenAIPEnabled: toggleOpenAIPMode,
    setIsSettingsOpen,
    canUseRadarMode,
    onMapClick: handleMapClick,
    setHeadingControlRef: headingControlRef,
    setRadarControlRef: radarControlRef,
    setOSMControlRef: osmControlRef,
    setOpenAIPControlRef: openAIPControlRef,
    setSettingsControlRef: settingsControlRef,
    onResetMapView: handleResetMapView,
    isMobile,
    hideUi,
  });

  const {
    drawFlightPlan,
    drawMultipleFlightPlans,
    drawImportedFlightPlan,
    clearImportedFlightPlan,
    currentSelectedAircraftRef,
    clearHistoryPolyline,
    clearFlightPlans,
    redrawFlightPlans,
  } = useFlightPlanDrawing({
    mapInstance: mapRefs.mapInstance,
    flightPlanLayerGroup: mapRefs.flightPlanLayerGroup,
    importedFlightPlanLayerGroup: mapRefs.importedFlightPlanLayerGroup,
    historyLayerGroup: mapRefs.historyLayerGroup,
    isRadarMode,
    airports,
    showFlightPlanWaypoints,
  });

  // Update the ref so handleMapClick can clear the polyline
  clearHistoryPolylineRef.current = clearHistoryPolyline;
  clearFlightPlansRef.current = clearFlightPlans;

  useEffect(() => {
    redrawFlightPlans();
  }, [redrawFlightPlans]);

  useMapLayersAndMarkers({
    mapInstance: mapRefs.mapInstance,
    radarTrailsLayer: mapRefs.radarTrailsLayerGroup,
    radarModeLineLayer: mapRefs.radarModeLineLayerGroup,
    runwayCenterlineLayer: mapRefs.runwayCenterlineLayerGroup,
    aircraftMarkersLayer: mapRefs.aircraftMarkersLayer,
    airportMarkersLayer: mapRefs.airportMarkersLayer,
    osmLayer: mapRefs.osmLayer,
    satelliteHybridLayer: mapRefs.satelliteHybridLayer,
    radarBaseLayer: mapRefs.radarBaseLayer,
    openAIPLayer: mapRefs.openAIPLayer,
    aircrafts: liveAircrafts,
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
    showConflicts: canUseConflictAlerts && showConflicts,
    onConflictsChange: setConflictAlerts,
    onInitialTrafficPaint,
    mapReady: mapRefs.mapReady,
    isMobile,
  });

  useSelectedAirportHandling({
    mapInstance: mapRefs.mapInstance,
    selectedAirport,
    isRadarMode,
  });

  useHeadingModeInteraction({
    mapInstance: mapRefs.mapInstance,
    isHeadingMode,
    setIsHeadingMode,
    isRadarMode,
  });

  const isWeatherReady = useWeatherOverlayLayer({
    mapInstance: mapRefs.mapInstance,
    mapReady: mapRefs.mapReady,
    showPrecipitation,
    showAirmets: canUseAdvancedWeather && showAirmets,
    showSigmets: canUseAdvancedWeather && showSigmets,
  });

  useEffect(() => {
    onWeatherReadyChange?.(!proLoading && isWeatherReady);
  }, [isWeatherReady, proLoading, onWeatherReadyChange]);

  useWaypointOverlayLayer({
    mapInstance: mapRefs.mapInstance,
    mapReady: mapRefs.mapReady,
    enabled: showWaypoints,
  });

  useEffect(() => {
    if (headingControlRef.current)
      headingControlRef.current.updateState(isHeadingMode);
    if (radarControlRef.current)
      radarControlRef.current.updateState(canUseRadarMode && isRadarMode);
    if (osmControlRef.current) osmControlRef.current.updateState(isOSMMode);
    if (openAIPControlRef.current)
      openAIPControlRef.current.updateState(isOpenAIPEnabled);
    if (settingsControlRef.current)
      settingsControlRef.current.updateState(isSettingsOpen);
  }, [
    isHeadingMode,
    isRadarMode,
    isOSMMode,
    isOpenAIPEnabled,
    isSettingsOpen,
    canUseRadarMode,
    mapRefs.mapReady,
  ]);

  useEffect(() => {
    onLayerModeChange?.(isRadarMode || isOSMMode);
  }, [isRadarMode, isOSMMode, onLayerModeChange]);

  useEffect(() => {
    setDrawFlightPlanOnMap(drawFlightPlan);
  }, [drawFlightPlan, setDrawFlightPlanOnMap]);

  useEffect(() => {
    if (setDrawMultipleFlightPlansOnMap) {
      setDrawMultipleFlightPlansOnMap(drawMultipleFlightPlans);
    }
  }, [drawMultipleFlightPlans, setDrawMultipleFlightPlansOnMap]);

  useEffect(() => {
    if (mapRefs.mapInstance.current && onMapReady) {
      onMapReady();
    }
  }, [mapRefs.mapInstance, onMapReady]);

  useEffect(() => {
    if (hasReportedInitialBaseLayerRef.current || !mapRefs.mapReady) return;

    const activeBaseLayer = isRadarMode
      ? mapRefs.radarBaseLayer.current
      : isOSMMode
        ? mapRefs.osmLayer.current
        : mapRefs.satelliteHybridLayer.current;

    if (!activeBaseLayer) return;

    const markBaseLayerReady = () => {
      if (hasReportedInitialBaseLayerRef.current) return;
      hasReportedInitialBaseLayerRef.current = true;
      onInitialBaseLayerReady?.();
    };

    if (!activeBaseLayer.isLoading()) {
      markBaseLayerReady();
      return;
    }

    activeBaseLayer.once("load", markBaseLayerReady);

    return () => {
      activeBaseLayer.off("load", markBaseLayerReady);
    };
  }, [
    isOSMMode,
    isRadarMode,
    mapRefs.mapReady,
    mapRefs.osmLayer,
    mapRefs.radarBaseLayer,
    mapRefs.satelliteHybridLayer,
    onInitialBaseLayerReady,
  ]);

  const prevImportedFlightPlanRef = useRef<ImportedFlightPlan | null>(null);

  useEffect(() => {
    if (!mapRefs.mapReady) return;

    if (!importedFlightPlan) {
      prevImportedFlightPlanRef.current = null;
      clearImportedFlightPlan();
      return;
    }

    const shouldZoom = prevImportedFlightPlanRef.current !== importedFlightPlan;
    prevImportedFlightPlanRef.current = importedFlightPlan;
    drawImportedFlightPlan(importedFlightPlan, shouldZoom);
  }, [
    clearImportedFlightPlan,
    drawImportedFlightPlan,
    importedFlightPlan,
    mapRefs.mapReady,
  ]);

  const metar = useMetarOverlay(
    mapRefs.mapInstance,
    icaoInput || selectedAirport?.icao,
  );

  const { atis } = useAtisOverlay(icaoInput || selectedAirport?.icao);

  // Fetch NOTAMs when we have an ICAO (PRO users fetch from API, free users only see cache)
  const { notamData } = useNotamOverlay(
    icaoInput || selectedAirport?.icao,
    isProUser,
  );

  // Track previous historyPath to detect flight changes
  const prevHistoryPathRef = useRef<FlightRoutePoint[] | null>(null);
  const replayReferenceLon = replayState?.currentPosition?.[1];

  // Zoom to flight path when it changes (works for both replay and static history)
  useEffect(() => {
    if (
      !mapRefs.mapInstance.current ||
      !historyPath ||
      historyPath.length < 2
    ) {
      return;
    }

    // Only zoom if the path actually changed (new flight selected)
    if (prevHistoryPathRef.current !== historyPath) {
      prevHistoryPathRef.current = historyPath;
      const displayPath = preparePathForWorldCopy(
        historyPath.map(([lat, lon]) => [lat, lon] as [number, number]),
        replayReferenceLon,
      );
      const bounds = L.latLngBounds(displayPath);
      mapRefs.mapInstance.current.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 10,
      });
    }
  }, [historyPath, mapRefs.mapInstance, replayReferenceLon]);

  // Render historic flight path from Flight Log (only when NOT in replay mode)
  useEffect(() => {
    if (!mapRefs.mapInstance.current || !mapRefs.historyLayerGroup.current) {
      return;
    }

    // If replay is active, don't render static history path
    if (replayState) {
      mapRefs.historyLayerGroup.current.clearLayers();
      return;
    }

    // Only render when we have a valid historic path to show
    if (!historyPath || historyPath.length < 2) {
      return;
    }

    // Clear existing layers before drawing the historic path
    mapRefs.historyLayerGroup.current.clearLayers();

    const displayHistoryPath = preparePathForWorldCopy(
      historyPath.map(([lat, lon]) => [lat, lon] as [number, number]),
      replayReferenceLon,
    );

    if (displayHistoryPath.length >= 2) {
      const historyStyle = {
        color: isRadarMode ? "#00ff00" : "#00ff00",
        weight: isRadarMode ? 2 : 4,
        opacity: isRadarMode ? 0.7 : 0.8,
        smoothFactor: 1,
        dashArray: "",
      };

      const altitudeProfile = buildAltitudeProfile(historyPath);
      for (const segment of buildAltitudePathSegments(
        displayHistoryPath,
        altitudeProfile.altitudes,
      )) {
        mapRefs.historyLayerGroup.current.addLayer(
          L.polyline(segment.points, {
            ...historyStyle,
            color: ALTITUDE_RENDER_BANDS[segment.bandIndex]!.color,
          }),
        );
      }
    }
  }, [
    historyPath,
    isRadarMode,
    replayState,
    replayReferenceLon,
    mapRefs.mapInstance,
    mapRefs.historyLayerGroup,
  ]);

  // Follow mode - center map on followed aircraft
  useEffect(() => {
    if (!mapRefs.mapInstance.current || !followAircraft) return;

    const lat = Number(followAircraft.lat);
    const lon = Number(followAircraft.lon);

    if (isNaN(lat) || isNaN(lon)) return;

    mapRefs.mapInstance.current.setView([lat, lon], undefined, {
      animate: true,
      duration: 1.5,
    });
  }, [
    followAircraft?.lat,
    followAircraft?.lon,
    followAircraft,
    mapRefs.mapInstance,
  ]);

  // Render flight replay animation
  useEffect(() => {
    if (!mapRefs.mapInstance.current || !mapRefs.replayLayerGroup.current) {
      return;
    }

    // Clear replay layer if no replay state
    if (!replayState?.currentPosition) {
      mapRefs.replayLayerGroup.current.clearLayers();
      replayTraversedAltitudePolylinesRef.current = { segments: [] };
      replayRemainingAltitudePolylinesRef.current = { segments: [] };
      replayMarkerRef.current = null;
      return;
    }

    const { currentPosition, currentHeading, traversedPath, remainingPath } =
      replayState;

    const displayTraversedPath = preparePathForWorldCopy(
      traversedPath,
      currentPosition[1],
    );
    const displayRemainingPath = preparePathForWorldCopy(
      remainingPath,
      currentPosition[1],
    );
    // Draw the traversed path with the same bands as the altitude legend.
    if (displayTraversedPath.length >= 2) {
      const traversedStyle = {
        color: "#f59e0b", // amber-500
        weight: isRadarMode ? 2 : 4,
        opacity: isRadarMode ? 0.8 : 0.9,
        smoothFactor: 1,
      };

      renderAltitudePolylines(
        mapRefs.replayLayerGroup.current,
        replayTraversedAltitudePolylinesRef,
        displayTraversedPath,
        replayState.traversedAltitudes,
        traversedStyle,
      );
    } else {
      clearAltitudePolylines(
        mapRefs.replayLayerGroup.current,
        replayTraversedAltitudePolylinesRef,
      );
    }

    // Keep the remaining path dashed and faded while sharing the same bands.
    if (displayRemainingPath.length >= 2) {
      const remainingStyle = {
        color: "#f59e0b", // amber-500
        weight: isRadarMode ? 1 : 2,
        opacity: isRadarMode ? 0.3 : 0.4,
        smoothFactor: 1,
        dashArray: "8, 8",
      };

      renderAltitudePolylines(
        mapRefs.replayLayerGroup.current,
        replayRemainingAltitudePolylinesRef,
        displayRemainingPath,
        replayState.remainingAltitudes,
        remainingStyle,
      );
    } else {
      clearAltitudePolylines(
        mapRefs.replayLayerGroup.current,
        replayRemainingAltitudePolylinesRef,
      );
    }

    const displayCurrentPosition =
      displayTraversedPath[displayTraversedPath.length - 1] ?? currentPosition;

    if (replayMarkerRef.current) {
      replayMarkerRef.current
        .setLatLng(displayCurrentPosition)
        .setIcon(
          getReplayAircraftIcon(
            currentHeading,
            replayState.currentAltitude,
            replayState.altitudeIsEstimated,
          ),
        );
    } else {
      replayMarkerRef.current = L.marker(displayCurrentPosition, {
        icon: getReplayAircraftIcon(
          currentHeading,
          replayState.currentAltitude,
          replayState.altitudeIsEstimated,
        ),
        zIndexOffset: 1000,
      }).addTo(mapRefs.replayLayerGroup.current);
    }
  }, [replayState, isRadarMode, mapRefs.mapInstance, mapRefs.replayLayerGroup]);

  const altitudeTracks = useMemo<AltitudeTrack[]>(() => {
    if (!isAltitude3D) return [];
    if (replayState?.currentPosition)
      return [
        {
          id: "Replay",
          path: replayState.traversedPath,
          altitudes: replayState.traversedAltitudes,
          estimated: replayState.altitudeIsEstimated,
        },
        {
          id: "Replay",
          path: replayState.remainingPath,
          altitudes: replayState.remainingAltitudes,
          estimated: replayState.altitudeIsEstimated,
          remaining: true,
        },
      ];
    if (historyPath?.length) {
      const profile = buildAltitudeProfile(historyPath);
      return [
        {
          id: "Flight history",
          path: historyPath.map(([lat, lon]) => [lat, lon]),
          altitudes: profile.altitudes,
          estimated: profile.isEstimated,
        },
      ];
    }
    return aircrafts
      .filter((aircraft) =>
        selectedAircraftIds.includes(aircraft.callsign || aircraft.id),
      )
      .map(liveAltitudeTrack);
  }, [isAltitude3D, replayState, historyPath, aircrafts, selectedAircraftIds]);

  useAltitudeOverlay({
    map: mapRefs.mapInstance,
    ready: mapRefs.mapReady,
    enabled: isAltitude3D,
    hideUi,
    revision: mapRefs.mapRevision,
    onToggle: () => setIsAltitude3D((value) => !value),
    tracks: altitudeTracks,
    aircrafts,
    aircraftLayer: mapRefs.aircraftMarkersLayer,
    historyLayer: mapRefs.historyLayerGroup,
    replayLayer: mapRefs.replayLayerGroup,
    replayAltitude: replayState?.currentAltitude,
  });

  return (
    <>
      <MapGlobalStyles hideUi={hideUi} />
      <div
        id="map-container"
        style={{ height: "100%", width: "100%", background: "#081722" }}
      />

      {!hideUi ? (
        <MapSettingsSidebar
          isOpen={isSettingsOpen}
          isMobile={isMobile}
          onClose={() => setIsSettingsOpen(false)}
        >
          <RadarSettings
            isPRO={isProUser}
            radarTrailPreferences={radarTrailPreferences}
            radarModeLinePreferences={radarModeLinePreferences}
            runwayCenterlinePreferences={runwayCenterlinePreferences}
            onRadarTrailPreferencesChange={(nextPreferences) => {
              setRadarTrailPreferences(
                setStoredRadarTrailPreferences(nextPreferences),
              );
            }}
            onRadarModeLinePreferencesChange={(nextPreferences) => {
              setRadarModeLinePreferences(
                setStoredRadarModeLinePreferences(nextPreferences),
              );
            }}
            onRunwayCenterlinePreferencesChange={(nextPreferences) => {
              setRunwayCenterlinePreferences(
                setStoredRunwayCenterlinePreferences(nextPreferences),
              );
            }}
            presets={layerPresets}
            activePresetId={activePreset?.id ?? null}
            selectedPresetId={selectedPreset?.id ?? null}
            onApplyPreset={applyLayerPreset}
            onSavePreset={saveLayerPreset}
            onUpdatePreset={updateLayerPreset}
            onDeletePreset={deleteLayerPreset}
            showWaypoints={showWaypoints}
            setShowWaypoints={setShowWaypoints}
            showPrecipitation={showPrecipitation}
            setShowPrecipitation={setShowPrecipitation}
            showAirmets={showAirmets}
            setShowAirmets={setShowAirmets}
            showSigmets={showSigmets}
            setShowSigmets={setShowSigmets}
            showConflicts={showConflicts}
            setShowConflicts={setShowConflicts}
            keybindPreferences={keybindPreferences}
            onKeybindPreferencesChange={onKeybindPreferencesChange}
          />
        </MapSettingsSidebar>
      ) : null}

      {canUseConflictAlerts &&
      showConflicts &&
      !isMobile &&
      !hideUi &&
      !isSettingsOpen ? (
        <div className="pointer-events-none absolute top-[180px] right-[22px] z-[10012] w-[300px] select-none">
          <ConflictMonitorPanel
            alerts={conflictAlerts}
            history={conflictHistory}
            onClearHistory={handleClearConflictEvents}
            onReviewAlert={handleReviewConflictEvent}
            onReviewHistoryEvent={handleReviewConflictEvent}
          />
        </div>
      ) : null}

      {/* Hide METAR panel on mobile */}
      {!isMobile && !hideUi && (
        <MetarPanel
          icaoInput={icaoInput}
          onChange={setIcaoInput}
          selectedAirportIcao={selectedAirport?.icao}
          metarText={metar?.raw || null}
          atisText={atis?.datis || null}
          atisCode={atis?.code || null}
          notams={notamData?.notams || null}
          notamCount={notamData?.count || 0}
          isPro={isProUser}
        />
      )}
    </>
  );
};

export default MapComponent;

function SeverityStat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-center font-mono ${tone}`}
    >
      <p className="text-[9px] tracking-[0.18em] uppercase">{label}</p>
      <p className="text-sm font-bold">{count}</p>
    </div>
  );
}

function ConflictMonitorPanel({
  alerts,
  history,
  onClearHistory,
  onReviewAlert,
  onReviewHistoryEvent,
}: {
  alerts: ConflictAlertSummary[];
  history: ConflictHistoryEvent[];
  onClearHistory: () => void;
  onReviewAlert: (alert: ConflictAlertSummary) => void;
  onReviewHistoryEvent: (event: ConflictHistoryEvent) => void;
}) {
  const highCount = alerts.filter((alert) => alert.severity === "high").length;
  const mediumCount = alerts.filter(
    (alert) => alert.severity === "medium",
  ).length;
  const lowCount = alerts.filter((alert) => alert.severity === "low").length;

  return (
    <div className="pointer-events-auto rounded-xl border border-cyan-400/30 bg-gradient-to-b from-[#03131c]/95 to-[#01090f]/95 p-4 shadow-[0_0_30px_rgba(34,211,238,0.12)] backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, transparent, transparent 5px, rgba(34,211,238,0.08) 6px)",
        }}
      />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-400/80 uppercase">
              Conflict Monitor
            </p>
            <p className="font-mono text-xs text-white/60">
              Live CPA prediction + review log
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-80" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="font-mono text-[10px] font-bold text-cyan-300">
              {alerts.length} ACTIVE
            </span>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <SeverityStat
            label="HIGH"
            tone="text-red-300 border-red-400/30 bg-red-500/10"
            count={highCount}
          />
          <SeverityStat
            label="MED"
            tone="text-amber-300 border-amber-400/30 bg-amber-500/10"
            count={mediumCount}
          />
          <SeverityStat
            label="LOW"
            tone="text-yellow-200 border-yellow-300/30 bg-yellow-500/10"
            count={lowCount}
          />
        </div>

        <div className="space-y-1.5">
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-white/50">
              No predicted conflicts in current traffic.
            </div>
          ) : (
            alerts
              .slice(0, 5)
              .map((alert) => (
                <ConflictAlertCard
                  key={alert.id}
                  alert={alert}
                  onReview={() => onReviewAlert(alert)}
                />
              ))
          )}
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-300/80 uppercase">
                Recent Events
              </p>
              <p className="text-[10px] text-white/45">
                Keeps the latest live alerts for quick review.
              </p>
            </div>
            <button
              onClick={onClearHistory}
              className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/60 transition-colors hover:border-white/20 hover:text-white"
            >
              Clear
            </button>
          </div>

          <div className="space-y-1.5">
            {history.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white/45">
                No conflict events logged yet.
              </div>
            ) : (
              history.map((event) => (
                <ConflictHistoryCard
                  key={event.eventKey}
                  event={event}
                  onReview={() => onReviewHistoryEvent(event)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConflictAlertCard({
  alert,
  onReview,
}: {
  alert: ConflictAlertSummary;
  onReview: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px]">
      <div className="flex items-center justify-between gap-3 text-white/85">
        <span className="truncate">{alert.callsignA}</span>
        <span className="text-white/35">×</span>
        <span className="truncate">{alert.callsignB}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-white/50">
        <span>
          {alert.horizontalSeparationNm.toFixed(1)}nm /{" "}
          {Math.round(alert.verticalSeparationFt)}ft
        </span>
        <span>T-{alert.timeToCpaMinutes.toFixed(1)}m</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] tracking-[0.14em] uppercase ${getSeverityTone(alert.severity)}`}
        >
          {alert.severity}
        </span>
        <button
          onClick={onReview}
          className="cursor-pointer rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 transition-colors hover:bg-cyan-500/15"
        >
          Review
        </button>
      </div>
    </div>
  );
}

function ConflictHistoryCard({
  event,
  onReview,
}: {
  event: ConflictHistoryEvent;
  onReview: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-white/85">
            <span className="truncate">{event.callsignA}</span>
            <span className="text-white/35">×</span>
            <span className="truncate">{event.callsignB}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-white/45">
            <span>{formatConflictEventAge(event.lastSeenAt)}</span>
            <span>•</span>
            <span>{event.horizontalSeparationNm.toFixed(1)}nm</span>
            <span>•</span>
            <span>{Math.round(event.verticalSeparationFt)}ft</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] tracking-[0.14em] uppercase ${getSeverityTone(event.severity)}`}
          >
            {event.severity}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-white/45">
          Last seen T-{event.timeToCpaMinutes.toFixed(1)}m
        </span>
        <button
          onClick={onReview}
          className="cursor-pointer rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 transition-colors hover:bg-cyan-500/15"
        >
          Review
        </button>
      </div>
    </div>
  );
}

function getSeverityTone(severity: ConflictAlertSummary["severity"]) {
  if (severity === "high") {
    return "border-red-400/30 bg-red-500/10 text-red-200";
  }
  if (severity === "medium") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  }
  return "border-yellow-300/30 bg-yellow-500/10 text-yellow-100";
}

function formatConflictEventAge(timestamp: number) {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ago`;
}
