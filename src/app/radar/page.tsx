"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { type Id } from "../../../convex/_generated/dataModel";

import { type PositionUpdate } from "~/lib/aircraft-store";
import { activeAircraft } from "~/lib/aircraft-store";
import { type FlightRoutePoint } from "~/lib/flightTelemetry";
import {
  parseImportedFlightPlan,
  type ImportedFlightPlan,
} from "~/lib/flightPlanImport";
import { useMobileDetection, useDeviceType } from "~/hooks/useMobileDetection";
import { useAircraftStream } from "~/hooks/useAircraftStream";
import { useAirlineTelephony } from "~/hooks/useAirlineTelephony";
import { useAirportData } from "~/hooks/useAirportData";
import { useAircraftSearch } from "~/hooks/useAircraftSearch";
import { useDisplayedTime } from "~/hooks/useDisplayedTime";
import { useTimer } from "~/hooks/useTimer";
import { useActiveFlightPath } from "~/hooks/useActiveFlightPath";
// useAirportCharts hook moved into AirportChartsViewer component
import { useProStatus } from "~/hooks/useProStatus";
import { useRecentSearches } from "~/hooks/useRecentSearches";
import { useActiveTracker } from "~/hooks/useActiveTracker";
import { useMostTrackedFlights } from "~/hooks/useMostTrackedFlights";
import { useTileCacheWorker } from "~/hooks/useTileCacheWorker";
import { preloadImages } from "~/lib/preloadImages";
import { Analytics } from "~/lib/analytics";
import { isFreeChartIcao } from "~/lib/chartAccess";
import {
  describeElement,
  getClientDiagnosticsContext,
  isEditableElement,
  isEditableTarget,
} from "~/lib/clientDiagnostics";
import { setCookie } from "~/lib/cookies";
import {
  getStoredRadarKeybindPreferences,
  setStoredRadarKeybindPreferences,
  shouldIgnoreRadarShortcut,
} from "~/lib/radarKeybindPreferences";
import { normalizeCallsign } from "~/lib/utils";
import {
  completeRadarGuideIfEligible,
  shouldOpenRadarGuide,
} from "~/lib/radarGuide";
import { type Airport } from "~/components/map";

import { ConnectionStatusIndicator } from "~/components/atc/connectionStatusIndicator";
import { SearchBar } from "~/components/atc/searchbar";
import { Sidebar, type HistoryFlight } from "~/components/atc/sidebar";
import { MultiAircraftSidebar } from "~/components/atc/MultiAircraftSidebar";
import { FlightReplayControls } from "~/components/flight-replay/FlightReplayControls";
import { CallsignFilter } from "~/components/atc/callsignFilter";
import { MostTrackedPanel } from "~/components/atc/MostTrackedPanel";
import { UserAuth } from "~/components/atc/userAuth";
import { ControlDock } from "~/components/atc/controlDock";
import { FIDSPanel } from "~/components/atc/FIDSPanel";
import { TaxiChartViewer } from "~/components/airports/TaxiChartsViewer";
import { AirportFIDPanel } from "~/components/airports/AirportFIDPanel";
import { ChartSidePanel } from "~/components/map/ChartOverlayPanel";
import { AtcPlayer } from "~/components/atc/AtcPlayer";
import { AirportActivityPanel } from "~/components/atc/AirportActivityPanel";
import { ImportedFlightPlanPanel } from "~/components/atc/ImportedFlightPlanPanel";
import { VstripsFileFlightModal } from "~/components/atc/VstripsFileFlightModal";
import { StatsExclusionsModal } from "~/components/atc/StatsExclusionsModal";
import { VirtualAirlineRegistrationModal } from "~/components/atc/VirtualAirlineRegistrationModal";
import { ProBadge } from "~/components/ui/pro-badge";
import { WhatsNew } from "~/components/ui/WhatsNew";
import { MobileSwipeSheet } from "~/components/ui/MobileSwipeSheet";
import { MobileDrawer } from "~/components/ui/MobileDrawer";
import { ShortcutsMenu } from "~/components/ui/ShortcutsMenu";
import { RadarGuide } from "~/components/onboarding/RadarGuide";
import {
  AirportsIcon,
  FlightsIcon,
  FilterIcon,
  DiscordIcon,
  InstallIcon,
  LeaderboardIcon,
  ShortcutsIcon,
  UploadIcon,
  AdminIcon,
} from "~/utils/dockIcons";
import {
  CircleHelp,
  Eye,
  FileText,
  Plane,
  Radar,
  RotateCcw,
  Route,
  ShieldCheck,
  X,
} from "lucide-react";
import { openPrivacySettings } from "~/components/privacy/PrivacyConsentProvider";
import { UnitPreferencesProvider } from "~/hooks/useUnitPreferences";
import { TimeDisplayPreferenceProvider } from "~/hooks/useTimeDisplayPreference";

const DynamicMapComponent = dynamic(() => import("~/components/map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

// Allow the initial weather tile requests to finish on slower connections.
const APP_BOOT_TIMEOUT_MS = 15000;
const DESKTOP_MAP_RENDERER_COOKIE = "desktop_map_renderer";

type RightPanel = "fids" | "filter" | "airports" | null;
interface VstripsEventSettings {
  isEventLive: boolean;
  airportMode: string;
  fixedAirport?: string;
  departureMode: string;
  fixedDeparture?: string;
  arrivalMode: string;
  fixedArrival?: string;
  timeMode: string;
  fixedTime?: string;
  altitudeMode?: string;
  fixedAltitude?: string;
  speedMode?: string;
  fixedSpeed?: string;
  routeMode: string;
  fixedRoute?: string;
  activeAirports: string[];
  airportData: { id: string; name: string }[];
}

export default function ATCPage() {
  return (
    <UnitPreferencesProvider>
      <TimeDisplayPreferenceProvider>
        <ATCPageContent />
      </TimeDisplayPreferenceProvider>
    </UnitPreferencesProvider>
  );
}

function ATCPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReplayRadarGuide = searchParams?.get("tour") === "1";
  useTileCacheWorker();
  const isMobile = useMobileDetection();
  const deviceType = useDeviceType();
  const isPhone = deviceType === "phone";
  const isTablet = deviceType === "tablet";

  const {
    aircrafts: streamedAircrafts,
    isLoading,
    connectionStatus,
    onlineAirports,
    error: streamError,
    lastMessageAgeSeconds,
  } = useAircraftStream();
  const aircrafts = useAirlineTelephony(streamedAircrafts);
  const {
    airports,
    runways,
    fetchAirports,
    isLoading: isAirportDataLoading,
  } = useAirportData();

  // Fetch airports/runways once live traffic arrives so radar overlays can render.
  useEffect(() => {
    if (aircrafts.length > 0 || onlineAirports.length > 0) {
      fetchAirports();
    }
  }, [aircrafts.length, onlineAirports.length, fetchAirports]);

  const { isProUser, isAdminUser, isLoading: proLoading } = useProStatus();
  const shouldShowRadarGuide = useQuery(api.users.shouldShowRadarGuide);
  const completeRadarGuide = useMutation(api.users.completeRadarGuide);
  const [isRadarGuideOpen, setIsRadarGuideOpen] = useState(false);
  const hasOpenedRadarGuide = useRef(false);

  const finishRadarGuide = useCallback(() => {
    setIsRadarGuideOpen(false);
    void completeRadarGuideIfEligible(
      shouldShowRadarGuide,
      completeRadarGuide,
    )?.catch(() => {
      toast.error("We couldn't save your tour progress.");
    });
  }, [completeRadarGuide, shouldShowRadarGuide]);

  const [selectedAircrafts, setSelectedAircrafts] = useState<PositionUpdate[]>(
    [],
  );
  const [keybindPreferences, setKeybindPreferences] = useState(() =>
    getStoredRadarKeybindPreferences(),
  );
  const [selectedAirport, setSelectedAirport] = useState<Airport | undefined>(
    undefined,
  );
  const canAccessSelectedAirportCharts =
    Boolean(selectedAirport?.icao) &&
    (isProUser || isFreeChartIcao(selectedAirport?.icao));

  const [historyPath, setHistoryPath] = useState<FlightRoutePoint[] | null>(
    null,
  );
  const [isViewingHistory, setIsViewingHistory] = useState(false);

  // Flight replay state
  const [replayFlight, setReplayFlight] = useState<HistoryFlight | null>(null);
  const [replayState, setReplayState] = useState<{
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
  } | null>(null);

  // Check if callsign param is a full flight number (e.g., EK213) vs just a prefix (e.g., EK)
  const callsignParam = searchParams?.get("callsign") ?? null;
  const normalizedCallsignParam = callsignParam
    ? normalizeCallsign(callsignParam)
    : null;
  const airportParam = searchParams?.get("airport") ?? null;
  const normalizedAirportParam = airportParam?.trim().toUpperCase() || null;
  const isFullFlightNumberParam =
    normalizedCallsignParam && /^[A-Z]+\d+.*$/i.test(normalizedCallsignParam);

  // Handle replay param from dashboard
  const replayParam = searchParams?.get("replay") ?? null;
  const replayFlightQuery = useQuery(
    api.flights.getById,
    replayParam ? { id: replayParam as Id<"flights"> } : "skip",
  );

  // State for full flight number filter (can be cleared with Escape)
  const [fullFlightFilter, setFullFlightFilter] = useState<string | null>(
    () => {
      if (isFullFlightNumberParam && normalizedCallsignParam) {
        return normalizedCallsignParam;
      }
      return null;
    },
  );

  const [selectedCallsigns, setSelectedCallsigns] = useState<Set<string>>(
    () => {
      // If it's a full flight number, don't use prefix filtering
      if (isFullFlightNumberParam) return new Set();

      if (callsignParam) {
        const prefixes = callsignParam
          .split(",")
          .map((s) => normalizeCallsign(s))
          .filter(Boolean);
        return new Set(prefixes);
      }
      return new Set();
    },
  );

  // Track if we've already auto-selected from URL param
  const [autoSelectedFromUrl, setAutoSelectedFromUrl] = useState(false);
  const [
    hasResolvedInitialAirportFromUrl,
    setHasResolvedInitialAirportFromUrl,
  ] = useState(() => !normalizedAirportParam);

  const [activeRightPanel, setActiveRightPanel] = useState<RightPanel>(null);
  const [vstripsSettings, setVstripsSettings] =
    useState<VstripsEventSettings | null>(null);
  const [isLoadingVstripsSettings, setIsLoadingVstripsSettings] =
    useState(false);
  const [showFileFlightModal, setShowFileFlightModal] = useState(false);
  const [showStatsExclusionsModal, setShowStatsExclusionsModal] =
    useState(false);
  const [showVirtualAirlineRegistration, setShowVirtualAirlineRegistration] =
    useState(false);

  const loadVstripsSettings = useCallback(async () => {
    setIsLoadingVstripsSettings(true);
    try {
      const response = await fetch("/api/vstrips/flight-filing", {
        cache: "no-store",
      });
      if (!response.ok) {
        setVstripsSettings(null);
        return;
      }

      const data = (await response.json()) as {
        settings?: VstripsEventSettings;
      };
      setVstripsSettings(data.settings?.isEventLive ? data.settings : null);
    } catch {
      setVstripsSettings(null);
    } finally {
      setIsLoadingVstripsSettings(false);
    }
  }, []);

  useEffect(() => {
    if (showFileFlightModal) {
      void loadVstripsSettings();
      return;
    }
    setVstripsSettings(null);
    setIsLoadingVstripsSettings(false);
  }, [loadVstripsSettings, showFileFlightModal]);

  useEffect(() => {
    if (activeRightPanel === "airports") {
      fetchAirports();
    }
  }, [activeRightPanel, fetchAirports]);

  const [showTaxiChart, setShowTaxiChart] = useState(false);
  const [showAtcPlayer, setShowAtcPlayer] = useState(false);
  const [showAirportFID, setShowAirportFID] = useState(false);
  const [chartOverlayActive, setChartOverlayActive] = useState(false);
  const [chartOverlayIcao, setChartOverlayIcao] = useState<string | null>(null);

  const [showTimerPopup, setShowTimerPopup] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [hasInitialBaseLayerLoaded, setHasInitialBaseLayerLoaded] =
    useState(false);
  const [hasInitialTrafficPainted, setHasInitialTrafficPainted] =
    useState(false);
  const [isWeatherReady, setIsWeatherReady] = useState(false);
  const [areLogosReady, setAreLogosReady] = useState(false);
  const [hasBootTimedOut, setHasBootTimedOut] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showShortcutsMenu, setShowShortcutsMenu] = useState(false);
  const [isDarkLayerMode, setIsDarkLayerMode] = useState(false);
  const [isFollowMode, setIsFollowMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [flightDisplayMode, setFlightDisplayMode] = useState<
    "default" | "labels-hidden" | "waypoints-hidden" | "minimal"
  >("default");
  const [isHeadingMode, setIsHeadingMode] = useState(false);
  const [pendingAirportIcao, setPendingAirportIcao] = useState<string | null>(
    null,
  );
  const [importedFlightPlan, setImportedFlightPlan] =
    useState<ImportedFlightPlan | null>(null);
  const [showImportedFlightPlanPanel, setShowImportedFlightPlanPanel] =
    useState(false);

  useEffect(() => {
    if (
      !shouldOpenRadarGuide({
        isAppReady,
        shouldReplay: shouldReplayRadarGuide,
        eligibility: shouldShowRadarGuide,
        hasOpened: hasOpenedRadarGuide.current,
      })
    ) {
      return;
    }
    hasOpenedRadarGuide.current = true;
    setIsRadarGuideOpen(true);
  }, [isAppReady, shouldReplayRadarGuide, shouldShowRadarGuide]);

  const aircraftGoogleIds = useMemo(
    () =>
      Array.from(
        new Set(aircrafts.map((aircraft) => aircraft.googleId).filter(Boolean)),
      ).sort() as string[],
    [aircrafts],
  );
  const pilotDiscordUsernamesByGoogleId =
    useQuery(
      api.users.getDiscordUsernamesByGoogleIds,
      aircraftGoogleIds.length > 0 ? { googleIds: aircraftGoogleIds } : "skip",
    ) ?? {};

  const { searchTerm, setSearchTerm, searchResults } = useAircraftSearch(
    aircrafts,
    airports,
    pilotDiscordUsernamesByGoogleId,
    fetchAirports,
  );

  const prepareRadarGuideDock = useCallback(() => {
    setSelectedAircrafts([]);
    setSelectedAirport(undefined);
    setPendingAirportIcao(null);
    setActiveRightPanel(null);
    setShowTaxiChart(false);
    setShowAtcPlayer(false);
    setShowAirportFID(false);
    setChartOverlayActive(false);
    setChartOverlayIcao(null);
    setShowShortcutsMenu(false);
    setShowMobileSearch(false);
    setShowImportedFlightPlanPanel(false);
    setHistoryPath(null);
    setIsViewingHistory(false);
    setReplayFlight(null);
    setReplayState(null);
    setIsFollowMode(false);
    setIsSidebarCollapsed(false);
    setSearchTerm("");
  }, [setSearchTerm]);

  const selectedAircraft =
    selectedAircrafts.length === 1 ? selectedAircrafts[0]! : null;
  const { flightPath: activeFlightPath } = useActiveFlightPath(
    !isViewingHistory ? selectedAircraft : null,
  );

  const {
    recentSearches,
    addAircraftSearch,
    addAirportSearch,
    addPilotSearch,
    clearRecentSearches,
  } = useRecentSearches();

  useActiveTracker(selectedAircrafts);
  const mostTrackedFlights = useMostTrackedFlights(aircrafts);

  const { time, zoneLabel } = useDisplayedTime();
  const { formattedTime, isRunning, start, stop, reset } = useTimer();

  const drawFlightPlanOnMapRef = useRef<
    ((ac: PositionUpdate, zoom?: boolean) => void) | null
  >(null);
  const drawMultipleFlightPlansOnMapRef = useRef<
    ((aircrafts: PositionUpdate[], zoom?: boolean) => void) | null
  >(null);
  const reportedShortcutDiagnosticsRef = useRef<Set<string>>(new Set());
  const importedFlightPlanInputRef = useRef<HTMLInputElement | null>(null);

  const replaceRadarSearchParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(window.location.search);
      mutate(params);

      const query = params.toString();
      const newUrl = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [],
  );

  const selectAirport = useCallback(
    (airport: Airport, options?: { addToRecent?: boolean }) => {
      setSelectedAirport(airport);
      setPendingAirportIcao(null);

      if (options?.addToRecent !== false) {
        addAirportSearch(airport);
      }
    },
    [addAirportSearch],
  );

  useEffect(() => {
    setCookie(DESKTOP_MAP_RENDERER_COOKIE, "", -1);
  }, []);

  useEffect(() => {
    setHasResolvedInitialAirportFromUrl(!normalizedAirportParam);
    setPendingAirportIcao(null);

    if (!normalizedAirportParam) {
      setSelectedAirport(undefined);
    }
  }, [normalizedAirportParam]);

  useEffect(() => {
    replaceRadarSearchParams((params) => {
      if (fullFlightFilter) {
        params.set("callsign", fullFlightFilter);
      } else if (selectedCallsigns.size > 0) {
        params.set("callsign", Array.from(selectedCallsigns).join(","));
      } else {
        params.delete("callsign");
      }
    });
  }, [selectedCallsigns, fullFlightFilter, replaceRadarSearchParams]);

  // Auto-start replay when flight data is loaded from URL param
  useEffect(() => {
    if (replayFlightQuery && !replayFlight) {
      setReplayFlight(replayFlightQuery);
      // Set history path to zoom the map to the flight route
      if (
        replayFlightQuery.routeData &&
        replayFlightQuery.routeData.length > 0
      ) {
        setHistoryPath(replayFlightQuery.routeData);
        setIsViewingHistory(true);
      }
      // Clear the replay param from URL after loading
      replaceRadarSearchParams((params) => {
        params.delete("replay");
      });
    }
  }, [replayFlightQuery, replayFlight, replaceRadarSearchParams]);

  useEffect(() => {
    if (hasResolvedInitialAirportFromUrl) return;

    if (!normalizedAirportParam) {
      setHasResolvedInitialAirportFromUrl(true);
      return;
    }

    const matchedAirport = airports.find(
      (airport) => airport.icao === normalizedAirportParam,
    );
    if (matchedAirport) {
      selectAirport(matchedAirport);
      setHasResolvedInitialAirportFromUrl(true);
      return;
    }

    if (airports.length === 0) {
      if (isAirportDataLoading) return;

      if (pendingAirportIcao !== normalizedAirportParam) {
        setPendingAirportIcao(normalizedAirportParam);
        fetchAirports();
        return;
      }

      setPendingAirportIcao(null);
      setHasResolvedInitialAirportFromUrl(true);
      return;
    }

    setPendingAirportIcao(null);
    setHasResolvedInitialAirportFromUrl(true);
  }, [
    airports,
    fetchAirports,
    hasResolvedInitialAirportFromUrl,
    isAirportDataLoading,
    normalizedAirportParam,
    pendingAirportIcao,
    selectAirport,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialAirportFromUrl) return;

    replaceRadarSearchParams((params) => {
      if (selectedAirport?.icao) {
        params.set("airport", selectedAirport.icao.toLowerCase());
      } else {
        params.delete("airport");
      }
    });
  }, [
    hasResolvedInitialAirportFromUrl,
    replaceRadarSearchParams,
    selectedAirport?.icao,
  ]);

  const filteredAircrafts = useMemo(() => {
    // If we have a full flight number filter, only show that aircraft
    if (fullFlightFilter) {
      return aircrafts.filter(
        (ac) =>
          ac.callsign?.toUpperCase() === fullFlightFilter ||
          ac.flightNo?.toUpperCase() === fullFlightFilter,
      );
    }

    if (selectedCallsigns.size === 0) return aircrafts;

    const prefixRegex = /^[A-Z]+/;

    return aircrafts.filter((aircraft) => {
      if (!aircraft.flightNo) return false;
      const match = prefixRegex.exec(aircraft.flightNo.trim().toUpperCase());
      return match && selectedCallsigns.has(match[0]);
    });
  }, [aircrafts, selectedCallsigns, fullFlightFilter]);

  const isReplayActive = isViewingHistory || replayFlight !== null;
  const visibleAircrafts = isReplayActive ? [] : filteredAircrafts;
  const visibleLiveAircrafts = isReplayActive ? [] : aircrafts;
  const isTrafficStale =
    connectionStatus === "connected" &&
    lastMessageAgeSeconds !== null &&
    lastMessageAgeSeconds >= 15;

  // Memoize selected aircraft IDs to avoid recalculating on every render
  const selectedAircraftIds = useMemo(
    () => selectedAircrafts.map((ac) => ac.callsign || ac.id),
    [selectedAircrafts],
  );

  const onlineAtcForSelected = useMemo(
    () =>
      selectedAirport
        ? onlineAirports.find((a) => a.icao === selectedAirport.icao)
        : undefined,
    [onlineAirports, selectedAirport],
  );

  const handleToggleCallsign = useCallback((prefix: string) => {
    setSelectedCallsigns((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
      }
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedCallsigns(new Set());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void preloadImages(["/logo-white.svg", "/logo-black.svg"])
      .then(() => {
        if (!cancelled) setAreLogosReady(true);
      })
      .catch(() => {
        // A failed logo is covered by the boot timeout.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMapReady = useCallback(() => {
    setIsMapLoaded(true);
  }, []);

  const handleInitialBaseLayerReady = useCallback(() => {
    setHasInitialBaseLayerLoaded(true);
  }, []);

  const handleInitialTrafficPaint = useCallback(() => {
    setHasInitialTrafficPainted(true);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasBootTimedOut(true);
    }, APP_BOOT_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (isAppReady) return;

    const hasCompletedInitialBoot =
      !isLoading &&
      isMapLoaded &&
      hasInitialBaseLayerLoaded &&
      hasInitialTrafficPainted &&
      isWeatherReady &&
      areLogosReady;

    if (!hasCompletedInitialBoot && !hasBootTimedOut) return;

    const frameId = window.requestAnimationFrame(() => {
      setIsAppReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    areLogosReady,
    isWeatherReady,
    hasBootTimedOut,
    hasInitialBaseLayerLoaded,
    hasInitialTrafficPainted,
    isAppReady,
    isLoading,
    isMapLoaded,
  ]);

  const handleAirportSelectByIcao = useCallback(
    (icao: string) => {
      const normalizedIcao = icao.trim().toUpperCase();
      if (!normalizedIcao) return;

      const airport = airports.find((ap) => ap.icao === normalizedIcao);
      if (airport) {
        selectAirport(airport);
        return;
      }

      setPendingAirportIcao(normalizedIcao);
      if (!isAirportDataLoading && airports.length === 0) {
        fetchAirports();
      }
    },
    [airports, fetchAirports, isAirportDataLoading, selectAirport],
  );

  const handleAirportExplorerSelect = useCallback(
    (icao: string) => {
      handleAirportSelectByIcao(icao);
      setActiveRightPanel(null);
      Analytics.track("airport_activity_airport_opened", {
        icao,
        source: "airport_activity_panel",
      });
    },
    [handleAirportSelectByIcao],
  );

  // Keep selected aircrafts in sync with updated positions and redraw paths
  useEffect(() => {
    if (selectedAircrafts.length === 0 || isViewingHistory) return;

    // Update selected aircraft data with latest positions
    const updatedSelection = selectedAircrafts.map((selectedAc) => {
      const updated = aircrafts.find(
        (ac) =>
          (ac.id && ac.id === selectedAc.id) ||
          (ac.callsign && ac.callsign === selectedAc.callsign),
      );
      return updated || selectedAc;
    });

    // Check if any aircraft actually changed
    const hasChanges = updatedSelection.some(
      (ac, i) => ac !== selectedAircrafts[i],
    );

    if (hasChanges) {
      setSelectedAircrafts(updatedSelection);
    }

    // Redraw all flight paths
    if (drawMultipleFlightPlansOnMapRef.current) {
      drawMultipleFlightPlansOnMapRef.current(updatedSelection, false);
    }
  }, [aircrafts, isViewingHistory, selectedAircrafts]);

  useEffect(() => {
    if (!selectedAircraft || !activeFlightPath || isViewingHistory) return;

    const aircraftId = selectedAircraft.callsign || selectedAircraft.id;
    activeAircraft.mergeFlightPath(aircraftId, activeFlightPath);
  }, [activeFlightPath, isViewingHistory, selectedAircraft]);

  useEffect(() => {
    if (!isReplayActive) return;

    setSelectedAircrafts([]);
    setIsFollowMode(false);
    setActiveRightPanel(null);
  }, [isReplayActive]);

  // Auto-select aircraft from URL param if it's a full flight number
  const followParam = searchParams?.get("follow") === "true";

  const handleMapReset = useCallback(() => {
    setFullFlightFilter(null);
    setSelectedCallsigns(new Set());
    setSelectedAircrafts([]);
    setSelectedAirport(undefined);
    setPendingAirportIcao(null);
    setHasResolvedInitialAirportFromUrl(true);
    setIsFollowMode(false);
    setAutoSelectedFromUrl(false);
    router.replace(window.location.pathname);
  }, [router]);

  useEffect(() => {
    if (
      !fullFlightFilter ||
      autoSelectedFromUrl ||
      aircrafts.length === 0 ||
      !isMapLoaded ||
      !drawFlightPlanOnMapRef.current
    )
      return;

    const matchedAircraft = aircrafts.find(
      (ac) =>
        ac.callsign?.toUpperCase() === fullFlightFilter ||
        ac.flightNo?.toUpperCase() === fullFlightFilter,
    );

    if (matchedAircraft) {
      setSelectedAircrafts([matchedAircraft]);
      drawFlightPlanOnMapRef.current?.(matchedAircraft, true);
      setAutoSelectedFromUrl(true);
      if (followParam) {
        setIsFollowMode(true);
      }
    }
  }, [
    aircrafts,
    fullFlightFilter,
    autoSelectedFromUrl,
    followParam,
    isMapLoaded,
  ]);

  // Escape key to clear filters, F key to toggle follow mode, U key to hide UI
  useEffect(() => {
    const reportShortcutDiagnostic = (
      key: string,
      reason: string,
      target: EventTarget | null,
    ) => {
      const dedupeKey = `${key}:${reason}`;
      if (reportedShortcutDiagnosticsRef.current.has(dedupeKey)) return;

      reportedShortcutDiagnosticsRef.current.add(dedupeKey);
      const targetElement =
        target instanceof Element
          ? target
          : document.activeElement instanceof Element
            ? document.activeElement
            : null;

      Analytics.track("radar_shortcut_blocked", {
        key,
        reason,
        is_phone: isPhone,
        is_tablet: isTablet,
        show_mobile_search: showMobileSearch,
        show_shortcuts_menu: showShortcutsMenu,
        selected_aircraft_count: selectedAircrafts.length,
        ...describeElement(targetElement),
        ...getClientDiagnosticsContext(),
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRadarGuideOpen) return;

      const activeElement = document.activeElement;
      const isEditableContext =
        isEditableTarget(e.target) || isEditableElement(activeElement);
      const shouldIgnoreLetterShortcuts = shouldIgnoreRadarShortcut(
        e,
        activeElement,
      );

      if (showShortcutsMenu && e.key === "Escape") {
        return;
      }

      if (
        e.key === "Escape" &&
        (fullFlightFilter || selectedCallsigns.size > 0)
      ) {
        setFullFlightFilter(null);
        setSelectedCallsigns(new Set());
        setSelectedAircrafts([]);
        setAutoSelectedFromUrl(false);
      }

      if (e.code === keybindPreferences.toggleUi) {
        if (shouldIgnoreLetterShortcuts) {
          if (isEditableContext) {
            reportShortcutDiagnostic("u", "editable_context", e.target);
          }
          return;
        }

        e.preventDefault();
        setIsUiHidden((prev) => !prev);
        return;
      }

      // F key to toggle follow mode (only when aircraft is selected and not typing in input)
      if (e.code === keybindPreferences.follow) {
        if (shouldIgnoreLetterShortcuts) {
          return;
        }

        if (selectedAircrafts.length === 0) {
          return;
        }

        e.preventDefault();
        setIsFollowMode((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    fullFlightFilter,
    isRadarGuideOpen,
    isPhone,
    isTablet,
    selectedCallsigns,
    selectedAircrafts.length,
    showMobileSearch,
    showShortcutsMenu,
    keybindPreferences,
  ]);

  // Keep the sideview open on the last airport unless the user closes it.
  useEffect(() => {
    setShowAirportFID(false);
  }, [selectedAirport?.icao]);

  useEffect(() => {
    if (!chartOverlayActive || !selectedAirport?.icao) return;
    setChartOverlayIcao(selectedAirport.icao);
  }, [chartOverlayActive, selectedAirport?.icao]);

  useEffect(() => {
    if (!pendingAirportIcao || airports.length === 0) return;

    if (
      normalizedAirportParam &&
      pendingAirportIcao !== normalizedAirportParam
    ) {
      return;
    }

    const airport = airports.find((ap) => ap.icao === pendingAirportIcao);
    if (airport) {
      selectAirport(airport);
    }

    setPendingAirportIcao(null);
  }, [normalizedAirportParam, pendingAirportIcao, airports, selectAirport]);

  function handleAircraftSelect(
    aircraft: PositionUpdate | null,
    ctrlKey = false,
  ) {
    setIsViewingHistory(false);
    setHistoryPath(null);

    if (aircraft === null) {
      // Clear selection
      setSelectedAircrafts([]);
      setIsFollowMode(false);
    } else if (ctrlKey) {
      // CTRL+click: toggle selection
      setSelectedAircrafts((prev) => {
        const aircraftId = aircraft.callsign || aircraft.id;
        const existingIndex = prev.findIndex(
          (ac) => (ac.callsign || ac.id) === aircraftId,
        );
        if (existingIndex >= 0) {
          // Remove from selection - draw remaining paths
          const newSelection = prev.filter((_, i) => i !== existingIndex);
          if (newSelection.length > 0) {
            drawMultipleFlightPlansOnMapRef.current?.(newSelection, false);
          }
          return newSelection;
        } else {
          // Add to selection - draw all paths
          const newSelection = [...prev, aircraft];
          drawMultipleFlightPlansOnMapRef.current?.(newSelection, false);
          return newSelection;
        }
      });
    } else {
      // Normal click: replace selection
      setSelectedAircrafts([aircraft]);
      drawMultipleFlightPlansOnMapRef.current?.([aircraft], false);
    }

    setActiveRightPanel(null);
  }

  const handleConflictReview = useCallback(
    (aircraftsToReview: PositionUpdate[]) => {
      if (aircraftsToReview.length === 0) return;

      setIsViewingHistory(false);
      setHistoryPath(null);
      setIsFollowMode(false);
      setActiveRightPanel(null);
      setSelectedAircrafts(aircraftsToReview);

      if (aircraftsToReview.length === 1) {
        drawFlightPlanOnMapRef.current?.(aircraftsToReview[0]!, true);
        return;
      }

      drawMultipleFlightPlansOnMapRef.current?.(aircraftsToReview, true);
    },
    [],
  );

  const clearImportedFlightPlan = useCallback(() => {
    if (!importedFlightPlan) return;

    setImportedFlightPlan(null);
    setShowImportedFlightPlanPanel(false);
    Analytics.track("flight_plan_import_cleared", {
      source: "dock",
      display_name: importedFlightPlan.displayName,
    });
    toast.success("Imported flight plan cleared");
  }, [importedFlightPlan]);

  const handleFlightPlanImportClick = useCallback(() => {
    importedFlightPlanInputRef.current?.click();
  }, []);

  const handleFlightPlanFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const parsed = parseImportedFlightPlan(await file.text(), file.name);

        setImportedFlightPlan(parsed);
        setSelectedAircrafts([]);
        setSelectedAirport(undefined);
        setPendingAirportIcao(null);
        setHistoryPath(null);
        setIsViewingHistory(false);
        setReplayFlight(null);
        setReplayState(null);
        setIsFollowMode(false);
        setActiveRightPanel(null);
        setShowImportedFlightPlanPanel(true);

        Analytics.track("flight_plan_imported", {
          source: "dock",
          display_name: parsed.displayName,
          source_name: parsed.sourceName,
          waypoint_count: parsed.waypoints.length,
        });
        toast.success(
          `Imported ${parsed.displayName} with ${parsed.waypoints.length} waypoints`,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to import flight plan";

        Analytics.track("flight_plan_import_failed", {
          source: "dock",
          file_name: file.name,
          message,
        });
        toast.error(message);
      } finally {
        event.target.value = "";
      }
    },
    [],
  );

  const dockSections = [
    {
      id: "radar",
      label: "Radar",
      items: [
        {
          id: "import-plan",
          label: importedFlightPlan ? "Replace Plan" : "Import Plan",
          icon: UploadIcon,
          active: Boolean(importedFlightPlan),
          onClick: handleFlightPlanImportClick,
        },
        {
          id: "file-flight",
          label: "File Flight",
          icon: <FileText size={18} strokeWidth={1.8} />,
          active: showFileFlightModal,
          onClick: () => setShowFileFlightModal(true),
        },
        ...(importedFlightPlan
          ? [
              {
                id: "plan-details",
                label: "Plan Details",
                icon: <Route size={18} strokeWidth={1.8} />,
                active: showImportedFlightPlanPanel,
                onClick: () =>
                  setShowImportedFlightPlanPanel((current) => !current),
              },
              {
                id: "clear-plan",
                label: "Clear Plan",
                icon: <X size={18} strokeWidth={1.8} />,
                onClick: clearImportedFlightPlan,
              },
            ]
          : []),
        {
          id: "fids",
          label: "Flights",
          icon: FlightsIcon,
          active: activeRightPanel === "fids",
          onClick: () => {
            const newState = activeRightPanel !== "fids";
            setActiveRightPanel(newState ? "fids" : null);
            if (newState) setSelectedAircrafts([]);
          },
        },
        {
          id: "airports",
          label: "Airports",
          icon: AirportsIcon,
          active: activeRightPanel === "airports",
          onClick: () => {
            const newState = activeRightPanel !== "airports";
            setActiveRightPanel(newState ? "airports" : null);
            if (newState) {
              setSelectedAircrafts([]);
              Analytics.track("airport_activity_panel_opened", {
                source: "dock",
              });
            }
          },
        },
        {
          id: "filter",
          label: "Filter",
          icon: FilterIcon,
          active: activeRightPanel === "filter",
          onClick: () => {
            const newState = activeRightPanel !== "filter";
            setActiveRightPanel(newState ? "filter" : null);
            if (newState) setSelectedAircrafts([]);
          },
        },
        {
          id: "shortcuts",
          label: "Shortcuts",
          icon: ShortcutsIcon,
          active: showShortcutsMenu,
          onClick: () => {
            setShowShortcutsMenu(true);
            Analytics.shortcutsOpened({ source: "dock" });
          },
        },
      ],
    },
    {
      id: "pages",
      label: "Pages",
      items: [
        {
          id: "leaderboard",
          label: "Leaderboard",
          icon: LeaderboardIcon,
          active: false,
          onClick: () => {
            Analytics.leaderboardIconClicked();
            router.push("/leaderboard");
          },
        },
        {
          id: "upload",
          label: "Upload",
          icon: UploadIcon,
          active: false,
          onClick: () => {
            router.push("/aircraft-images");
          },
        },
        {
          id: "register-va",
          label: "Register VA",
          icon: <Plane size={18} strokeWidth={1.8} />,
          active: showVirtualAirlineRegistration,
          onClick: () => setShowVirtualAirlineRegistration(true),
        },
        ...(isAdminUser
          ? [
              {
                id: "admin",
                label: "Admin",
                icon: AdminIcon,
                active: false,
                onClick: () => {
                  router.push("/admin");
                },
              },
            ]
          : []),
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [
        {
          id: "written-guides",
          label: "Guides",
          icon: <FileText size={18} strokeWidth={1.8} />,
          active: false,
          onClick: () =>
            window.open("/guides", "_blank", "noopener,noreferrer"),
        },
        {
          id: "radar-guide",
          label: "Radar Tour",
          icon: <Radar size={18} strokeWidth={1.8} />,
          active: isRadarGuideOpen,
          onClick: () => setIsRadarGuideOpen(true),
        },
        {
          id: "about-radar",
          label: "About Radar",
          icon: <CircleHelp size={18} strokeWidth={1.8} />,
          active: false,
          onClick: () => {
            const dialog = document.getElementById(
              "radar-about",
            ) as HTMLDialogElement | null;
            if (dialog && !dialog.open) dialog.showModal();
          },
        },
        {
          id: "stats-rules",
          label: "Stats Rules",
          icon: <CircleHelp size={18} strokeWidth={1.8} />,
          active: showStatsExclusionsModal,
          onClick: () => setShowStatsExclusionsModal(true),
        },
        {
          id: "install",
          label: "Install",
          icon: InstallIcon,
          active: false,
          onClick: () => {
            window.open("https://radarthing.com/userscript", "_blank");
          },
        },
        {
          id: "discord",
          label: "Help",
          icon: DiscordIcon,
          active: false,
          onClick: () => {
            window.open("https://discord.gg/pbQF4txdRC", "_blank");
          },
        },
        {
          id: "privacy-settings",
          label: "Privacy Settings",
          icon: <ShieldCheck size={18} strokeWidth={1.8} />,
          active: false,
          onClick: openPrivacySettings,
        },
        {
          id: "legal",
          label: "Privacy & Terms",
          icon: <FileText size={18} strokeWidth={1.8} />,
          active: false,
          onClick: () => router.push("/privacy"),
        },
      ],
    },
  ];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#081722]">
      <input
        ref={importedFlightPlanInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFlightPlanFileChange}
      />
      <VstripsFileFlightModal
        open={showFileFlightModal}
        isLoading={isLoadingVstripsSettings}
        settings={vstripsSettings}
        onClose={() => setShowFileFlightModal(false)}
      />
      <VirtualAirlineRegistrationModal
        open={showVirtualAirlineRegistration}
        onClose={() => setShowVirtualAirlineRegistration(false)}
      />
      <StatsExclusionsModal
        open={showStatsExclusionsModal}
        onClose={() => setShowStatsExclusionsModal(false)}
      />

      <div
        className={`fixed inset-0 z-[10030] transition-opacity duration-500 ${isAppReady ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"}`}
      >
        <MapSkeleton />
      </div>

      <header
        className={`absolute top-0 right-0 left-0 z-[10010] flex items-center justify-between ${isPhone ? "h-14 px-3 pt-1" : isTablet ? "h-16 px-4 pt-3" : "h-20 px-6 pt-5"}`}
      >
        <div className="flex items-center gap-2">
          {!isPhone && !isUiHidden && (
            <Image
              src={isDarkLayerMode ? "/logo-white.svg" : "/logo-black.svg"}
              alt="RadarThing"
              width={isPhone ? 100 : isTablet ? 100 : 130}
              height={isPhone ? 32 : isTablet ? 32 : 40}
              priority
              className="cursor-pointer"
              onClick={() => router.push("/radar")}
            />
          )}

          {!isUiHidden && isMapLoaded && !isPhone && (
            <div
              className={`pointer-events-auto h-11 translate-x-2 -translate-y-1 ${isTablet ? "w-64" : "w-80 lg:w-96"}`}
            >
              <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                searchResults={searchResults}
                isMobile={isMobile}
                autoFocus={false}
                inputDebugId="radar-header-search-input"
                onSelectAircraft={(ac) => {
                  setSelectedAircrafts([ac]);
                  drawFlightPlanOnMapRef.current?.(ac, true);
                  addAircraftSearch(ac);
                  setSearchTerm("");
                }}
                onSelectAirport={(ap) => {
                  selectAirport(ap);
                  setSearchTerm("");
                }}
                onSelectPilot={(pilot) => {
                  addPilotSearch(pilot);
                  setSearchTerm("");
                  router.push(`/pilot/${pilot._id}`);
                }}
                recentSearches={recentSearches}
                onSelectRecentSearch={(search) => {
                  if (search.type === "aircraft") {
                    const aircraft = aircrafts.find(
                      (ac) =>
                        ac.callsign === search.id ||
                        ac.flightNo === search.id ||
                        ac.id === search.id,
                    );
                    if (aircraft) {
                      setSelectedAircrafts([aircraft]);
                      drawFlightPlanOnMapRef.current?.(aircraft, true);
                    }
                  } else if (search.type === "airport") {
                    handleAirportSelectByIcao(search.id);
                  } else {
                    router.push(`/pilot/${search.id}`);
                  }
                }}
                onClearRecentSearches={clearRecentSearches}
              />
            </div>
          )}

          {/* Mobile search button — phone only */}
          {!isUiHidden && isMapLoaded && isPhone && !showMobileSearch && (
            <button
              data-tour="radar-mobile-search"
              onClick={() => setShowMobileSearch(true)}
              className="pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-black/60 backdrop-blur-md"
            >
              <svg
                className="h-4 w-4 text-cyan-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Radar clock */}
        {!isUiHidden && !isPhone && (
          <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2">
            <button
              onClick={() => setShowTimerPopup(!showTimerPopup)}
              className={`cursor-pointer rounded-lg border border-white/10 bg-black/40 backdrop-blur-md ${isTablet ? "px-3 py-1" : "px-4 py-1.5"}`}
            >
              <span
                className={`font-mono text-cyan-400 ${isTablet ? "text-base" : "text-xl"}`}
              >
                {time}{" "}
                <span className="text-[10px] text-slate-500">{zoneLabel}</span>
              </span>
              {showTimerPopup && (
                <span className="block font-mono text-sm text-emerald-400">
                  {formattedTime}
                </span>
              )}
              {isRunning && (
                <span className="block animate-pulse text-[9px] tracking-widest text-emerald-400 uppercase">
                  Timer Active
                </span>
              )}
            </button>

            {showTimerPopup && (
              <div className="animate-fade-in-up absolute top-full left-1/2 mt-2 -translate-x-1/2">
                <div className="rounded-xl border border-white/10 bg-black/90 p-3 backdrop-blur-xl">
                  <div className="flex gap-2">
                    <button
                      onClick={start}
                      disabled={isRunning}
                      className="cursor-pointer rounded-lg bg-emerald-500/20 px-3 py-1 text-xs text-emerald-400 disabled:opacity-50"
                    >
                      Start
                    </button>
                    <button
                      onClick={stop}
                      disabled={!isRunning}
                      className="cursor-pointer rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-400 disabled:opacity-50"
                    >
                      Stop
                    </button>
                    <button
                      onClick={reset}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-500/20 px-3 py-1 text-xs text-slate-400"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isUiHidden && (
          <div
            className={`pointer-events-auto flex items-center ${isMobile ? "gap-2" : "gap-4"}`}
          >
            {/* Compact clock on phone */}
            {isPhone && (
              <button
                onClick={() => setShowTimerPopup(!showTimerPopup)}
                className="flex h-7 items-center justify-center rounded-lg border border-white/10 bg-black/40 px-2.5 backdrop-blur-md"
              >
                <span className="flex h-full items-center justify-center gap-1 font-mono text-[11px] leading-none text-cyan-400">
                  <span className="leading-none">{time}</span>
                  <span className="text-[8px] leading-none text-slate-500">
                    {zoneLabel}
                  </span>
                </span>
              </button>
            )}
            {!isPhone && (
              <ConnectionStatusIndicator
                status={connectionStatus}
                isMobile={isMobile}
                isStale={isTrafficStale}
                lastMessageAgeSeconds={lastMessageAgeSeconds}
                error={streamError}
              />
            )}
            <WhatsNew isMobile={isMobile} />
            <UserAuth />
          </div>
        )}
      </header>

      {isUiHidden && (
        <button
          type="button"
          onClick={() => setIsUiHidden(false)}
          className="fixed top-3 left-1/2 z-[10020] flex h-10 w-10 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-cyan-300/35 bg-[#071019]/90 text-cyan-200 shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:bg-cyan-400/15 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
          aria-label="Show radar UI"
          title="Show radar UI"
        >
          <Eye size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {/* Mobile search - bottom sheet (phone only) */}
      {!isUiHidden && isPhone && showMobileSearch && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10019] bg-black/50"
            onClick={() => {
              setShowMobileSearch(false);
              setSearchTerm("");
            }}
          />
          {/* Bottom sheet */}
          <div
            className="animate-in slide-in-from-bottom fixed inset-x-0 bottom-0 z-[10020] rounded-t-2xl border-t border-white/10 bg-[#0a1219] px-4 pt-3 pb-8 duration-200"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
          >
            {/* Drag handle */}
            <div className="mb-4 flex justify-center">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            {/* Search input */}
            <input
              type="text"
              placeholder="Search flight, pilot, or airport..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              data-tour="radar-mobile-search"
              data-debug-id="radar-mobile-search-input"
              className="w-full rounded-xl border border-cyan-400/30 bg-black/60 px-4 py-3 text-[15px] text-cyan-400 placeholder-cyan-500/40 outline-none focus:border-cyan-400"
            />

            {/* Results */}
            {searchTerm &&
              (searchResults.aircrafts.length > 0 ||
                searchResults.airports.length > 0 ||
                searchResults.pilots.length > 0) && (
                <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-xl border border-white/10 bg-black/40">
                  {searchResults.aircrafts.length > 0 && (
                    <>
                      <div className="border-b border-white/10 bg-cyan-950/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-cyan-400 uppercase">
                        Aircrafts
                      </div>
                      {searchResults.aircrafts.map((aircraft, index) => (
                        <div
                          key={
                            aircraft.callsign ||
                            aircraft.flightNo ||
                            `ac-${index}`
                          }
                          onClick={() => {
                            setSelectedAircrafts([aircraft]);
                            drawFlightPlanOnMapRef.current?.(aircraft, true);
                            addAircraftSearch(aircraft);
                            setSearchTerm("");
                            setShowMobileSearch(false);
                          }}
                          className="border-b border-white/5 px-4 py-3 last:border-b-0 active:bg-white/10"
                        >
                          <div className="font-medium text-white">
                            {aircraft.callsign || aircraft.flightNo || "N/A"}
                          </div>
                          <div className="mt-0.5 text-[12px] text-white/50">
                            {aircraft.type} • {aircraft.departure} →{" "}
                            {aircraft.arrival || "UNK"}
                          </div>
                          {aircraft.pilotDiscordUsername && (
                            <div className="mt-1 text-[12px] text-cyan-300/80">
                              Pilot: {aircraft.pilotDiscordUsername}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {searchResults.pilots.length > 0 && (
                    <>
                      <div className="border-b border-white/10 bg-cyan-950/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-cyan-400 uppercase">
                        Pilots
                      </div>
                      {searchResults.pilots.map((pilot) => (
                        <div
                          key={`pilot-${pilot._id}`}
                          onClick={() => {
                            addPilotSearch(pilot);
                            setSearchTerm("");
                            setShowMobileSearch(false);
                            router.push(`/pilot/${pilot._id}`);
                          }}
                          className="border-b border-white/5 px-4 py-3 last:border-b-0 active:bg-white/10"
                        >
                          <div className="font-medium text-white">
                            {pilot.discordUsername ?? "Unknown Pilot"}
                          </div>
                          <div className="mt-0.5 text-[12px] text-white/50">
                            {pilot.pilotCallsign
                              ? `Pilot profile • ${pilot.pilotCallsign}`
                              : "Pilot profile"}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {searchResults.airports.length > 0 && (
                    <>
                      <div className="border-b border-white/10 bg-cyan-950/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-cyan-400 uppercase">
                        Airports
                      </div>
                      {searchResults.airports.map((airport) => (
                        <div
                          key={`ap-${airport.icao}`}
                          onClick={() => {
                            selectAirport(airport);
                            setSearchTerm("");
                            setShowMobileSearch(false);
                          }}
                          className="border-b border-white/5 px-4 py-3 last:border-b-0 active:bg-white/10"
                        >
                          <div className="font-medium text-white">
                            {airport.icao}
                          </div>
                          <div className="mt-0.5 text-[12px] text-white/50">
                            {airport.name}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

            {/* Recent searches - shown when no search term */}
            {!searchTerm && recentSearches.length > 0 && (
              <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-xl border border-white/10 bg-black/40">
                <div className="flex items-center justify-between border-b border-white/10 bg-cyan-950/30 px-4 py-2">
                  <div className="text-[11px] font-semibold tracking-wider text-cyan-400 uppercase">
                    Recent Searches
                  </div>
                  <button
                    onClick={clearRecentSearches}
                    className="text-[10px] text-cyan-400/60 transition-colors hover:text-cyan-400"
                  >
                    Clear
                  </button>
                </div>
                {recentSearches.map((search, index) => (
                  <div
                    key={`${search.type}-${search.id}-${index}`}
                    onClick={() => {
                      if (search.type === "aircraft") {
                        const aircraft = aircrafts.find(
                          (ac) =>
                            ac.callsign === search.id ||
                            ac.flightNo === search.id ||
                            ac.id === search.id,
                        );
                        if (aircraft) {
                          setSelectedAircrafts([aircraft]);
                          drawFlightPlanOnMapRef.current?.(aircraft, true);
                        }
                      } else if (search.type === "airport") {
                        handleAirportSelectByIcao(search.id);
                      } else {
                        router.push(`/pilot/${search.id}`);
                      }
                      setShowMobileSearch(false);
                    }}
                    className="border-b border-white/5 px-4 py-3 last:border-b-0 active:bg-white/10"
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-[14px]">
                        {search.type === "aircraft"
                          ? "✈"
                          : search.type === "pilot"
                            ? "👤"
                            : "🛫"}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-white">
                          {search.displayName}
                        </div>
                        {search.subtitle && (
                          <div className="mt-0.5 text-[12px] text-white/50">
                            {search.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {searchTerm &&
              searchResults.aircrafts.length === 0 &&
              searchResults.airports.length === 0 &&
              searchResults.pilots.length === 0 && (
                <div className="mt-6 text-center text-sm text-white/30">
                  No results found
                </div>
              )}
          </div>
        </>
      )}

      <main className="absolute inset-0" data-tour="radar-map">
        <DynamicMapComponent
          aircrafts={visibleAircrafts}
          airports={airports}
          runways={runways}
          onlineAirports={onlineAirports}
          isMobile={isPhone}
          selectedAirport={selectedAirport}
          selectedAircraftIds={selectedAircraftIds}
          onAircraftSelect={handleAircraftSelect}
          onAirportSelect={(airport) => {
            selectAirport(airport);
          }}
          setDrawFlightPlanOnMap={(fn) => {
            drawFlightPlanOnMapRef.current = fn;
          }}
          setDrawMultipleFlightPlansOnMap={(fn) => {
            drawMultipleFlightPlansOnMapRef.current = fn;
          }}
          onMapReady={handleMapReady}
          onInitialBaseLayerReady={handleInitialBaseLayerReady}
          onInitialTrafficPaint={handleInitialTrafficPaint}
          onWeatherReadyChange={setIsWeatherReady}
          historyPath={historyPath}
          onLayerModeChange={setIsDarkLayerMode}
          replayState={replayState}
          followAircraft={isFollowMode ? selectedAircrafts[0] : undefined}
          onConflictReview={handleConflictReview}
          onResetMapView={handleMapReset}
          hideUi={isUiHidden}
          importedFlightPlan={importedFlightPlan}
          flightDisplayModeRequest={flightDisplayMode}
          onFlightDisplayModeChange={setFlightDisplayMode}
          headingModeEnabled={isHeadingMode}
          onHeadingModeChange={setIsHeadingMode}
          keybindPreferences={keybindPreferences}
          onKeybindPreferencesChange={(preferences) => {
            setKeybindPreferences(
              setStoredRadarKeybindPreferences(preferences),
            );
          }}
        />

        {importedFlightPlan && showImportedFlightPlanPanel ? (
          <ImportedFlightPlanPanel
            flightPlan={importedFlightPlan}
            isMobile={isPhone}
            onClose={clearImportedFlightPlan}
          />
        ) : null}
      </main>

      {/* Right panels — phone: bottom sheet, tablet: narrower side panel, desktop: full side panel */}
      {!isUiHidden &&
        activeRightPanel === "fids" &&
        (isPhone ? (
          <MobileSwipeSheet onClose={() => setActiveRightPanel(null)}>
            <FIDSPanel
              aircrafts={visibleLiveAircrafts}
              onTrack={(ac) => {
                setSelectedAircrafts([ac]);
                setActiveRightPanel(null);
                drawFlightPlanOnMapRef.current?.(ac, true);
              }}
            />
          </MobileSwipeSheet>
        ) : (
          <aside
            className={`animate-slide-in-right fixed inset-y-0 right-0 z-[10012] w-full border-l border-white/10 bg-black/80 backdrop-blur-xl ${isTablet ? "max-w-[340px]" : "max-w-[420px]"}`}
          >
            <FIDSPanel
              aircrafts={visibleLiveAircrafts}
              onTrack={(ac) => {
                setSelectedAircrafts([ac]);
                setActiveRightPanel(null);
                drawFlightPlanOnMapRef.current?.(ac, true);
              }}
            />
          </aside>
        ))}

      {!isUiHidden &&
        activeRightPanel === "filter" &&
        (isPhone ? (
          <MobileSwipeSheet onClose={() => setActiveRightPanel(null)}>
            <CallsignFilter
              aircrafts={visibleLiveAircrafts}
              selectedCallsigns={selectedCallsigns}
              onToggleCallsign={handleToggleCallsign}
              onClearFilters={handleClearFilters}
            />
          </MobileSwipeSheet>
        ) : (
          <aside
            className={`animate-slide-in-right fixed inset-y-0 right-0 z-[10013] w-full border-l border-white/10 bg-black/80 backdrop-blur-xl ${isTablet ? "max-w-[300px]" : "max-w-[360px]"}`}
          >
            <CallsignFilter
              aircrafts={visibleLiveAircrafts}
              selectedCallsigns={selectedCallsigns}
              onToggleCallsign={handleToggleCallsign}
              onClearFilters={handleClearFilters}
            />
          </aside>
        ))}

      {!isUiHidden &&
        activeRightPanel === "airports" &&
        (isPhone ? (
          <MobileSwipeSheet onClose={() => setActiveRightPanel(null)}>
            <AirportActivityPanel
              aircrafts={visibleLiveAircrafts}
              airports={airports}
              onlineAirports={onlineAirports}
              selectedAirportIcao={selectedAirport?.icao}
              isAirportDataLoading={isAirportDataLoading}
              onSelectAirport={handleAirportExplorerSelect}
            />
          </MobileSwipeSheet>
        ) : (
          <aside
            className={`animate-slide-in-right fixed inset-y-0 right-0 z-[10013] w-full border-l border-white/10 bg-black/80 backdrop-blur-xl ${isTablet ? "max-w-[360px]" : "max-w-[420px]"}`}
          >
            <AirportActivityPanel
              aircrafts={visibleLiveAircrafts}
              airports={airports}
              onlineAirports={onlineAirports}
              selectedAirportIcao={selectedAirport?.icao}
              isAirportDataLoading={isAirportDataLoading}
              onSelectAirport={handleAirportExplorerSelect}
            />
          </aside>
        ))}

      {/* Control dock - compact on mobile, hidden when chart side panel is open */}
      {!isUiHidden && !(chartOverlayActive && chartOverlayIcao) && (
        <ControlDock side="right" isMobile={isMobile} sections={dockSections} />
      )}

      {!isUiHidden && selectedAirport && (
        <div
          className={`animate-fade-in-up fixed left-1/2 z-[10012] -translate-x-1/2 ${isPhone ? "bottom-3" : "bottom-6"}`}
        >
          <div
            className={`flex items-center rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl ${isPhone ? "max-w-[calc(100vw-2rem)] gap-1.5 px-2.5 py-2" : isTablet ? "gap-2.5 px-4 py-2.5" : "gap-4 px-5 py-3"}`}
          >
            <div>
              <div
                className={`font-mono text-cyan-300 ${isPhone ? "text-[10px]" : "text-xs"}`}
              >
                {selectedAirport.icao}
              </div>
              {!isPhone && (
                <div className="text-[10px] text-slate-400">
                  {selectedAirport.name}
                </div>
              )}
            </div>

            {canAccessSelectedAirportCharts ? (
              <button
                data-tour="airport-charts-button"
                onClick={() => {
                  setShowTaxiChart(true);
                }}
                className={`cursor-pointer rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 ${isPhone ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"}`}
              >
                Charts
              </button>
            ) : (
              <div
                className={`flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 ${isPhone ? "px-2 py-1" : "px-3 py-1.5"}`}
              >
                <span
                  className={`text-white/60 ${isPhone ? "text-[9px]" : "text-[10px]"}`}
                >
                  Charts
                </span>
                <ProBadge source="radar_airport_charts_badge" />
              </div>
            )}

            <button
              onClick={() => setShowAirportFID(!showAirportFID)}
              className={`cursor-pointer rounded-lg border transition-colors ${
                showAirportFID
                  ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
              } ${isPhone ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"}`}
            >
              {isPhone ? "FIDs" : "Flights"}
            </button>

            {!isPhone && (
              <button
                onClick={() => setShowAtcPlayer(!showAtcPlayer)}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[10px] transition-colors ${
                  showAtcPlayer
                    ? onlineAtcForSelected
                      ? "border-green-500/50 bg-green-500/20 text-green-300"
                      : "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                    : onlineAtcForSelected
                      ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {onlineAtcForSelected ? "Live ATC" : "ATC Audio"}
              </button>
            )}

            <button
              onClick={() => {
                setSelectedAirport(undefined);
                setPendingAirportIcao(null);
                setShowAtcPlayer(false);
                setShowAirportFID(false);
              }}
              className={`cursor-pointer rounded-lg border border-white/10 bg-white/5 text-white/60 ${isPhone ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"}`}
            >
              {isPhone ? "×" : "Unselect"}
            </button>
          </div>
        </div>
      )}

      {!isUiHidden && showAtcPlayer && selectedAirport && (
        <AtcPlayer
          icao={selectedAirport.icao}
          onClose={() => setShowAtcPlayer(false)}
          onlineAtc={onlineAtcForSelected}
        />
      )}

      {!isUiHidden &&
        showAirportFID &&
        selectedAirport &&
        (isPhone ? (
          <MobileSwipeSheet onClose={() => setShowAirportFID(false)}>
            <AirportFIDPanel
              icao={selectedAirport.icao}
              airportLat={selectedAirport.lat}
              airportLon={selectedAirport.lon}
              aircrafts={visibleLiveAircrafts}
              onTrack={(ac) => {
                setSelectedAircrafts([ac]);
                setShowAirportFID(false);
                drawFlightPlanOnMapRef.current?.(ac, true);
              }}
              onClose={() => setShowAirportFID(false)}
              isMobile={true}
            />
          </MobileSwipeSheet>
        ) : (
          <AirportFIDPanel
            icao={selectedAirport.icao}
            airportLat={selectedAirport.lat}
            airportLon={selectedAirport.lon}
            aircrafts={visibleLiveAircrafts}
            onTrack={(ac) => {
              setSelectedAircrafts([ac]);
              setShowAirportFID(false);
              drawFlightPlanOnMapRef.current?.(ac, true);
            }}
            onClose={() => setShowAirportFID(false)}
            isMobile={false}
          />
        ))}

      {!isUiHidden &&
        !isReplayActive &&
        selectedAircrafts.length > 0 &&
        (isPhone ? (
          <MobileDrawer onClose={() => setSelectedAircrafts([])}>
            {selectedAircrafts.length === 1 ? (
              <Sidebar
                key={selectedAircrafts[0]!.id}
                aircraft={selectedAircrafts[0]!}
                onWaypointClick={undefined}
                onHistoryClick={(flight) => {
                  setReplayFlight(flight);
                  setHistoryPath(flight.routeData || null);
                  setIsViewingHistory(true);
                }}
                onAirportClick={handleAirportSelectByIcao}
                isMobile={isMobile}
                onClose={() => setSelectedAircrafts([])}
                isFollowMode={isFollowMode}
                onToggleFollow={() => setIsFollowMode((prev) => !prev)}
              />
            ) : (
              <MultiAircraftSidebar
                aircrafts={selectedAircrafts}
                onRemoveAircraft={(aircraft) => {
                  const aircraftId = aircraft.callsign || aircraft.id;
                  const newSelection = selectedAircrafts.filter(
                    (ac) => (ac.callsign || ac.id) !== aircraftId,
                  );
                  setSelectedAircrafts(newSelection);
                  if (newSelection.length > 0) {
                    drawMultipleFlightPlansOnMapRef.current?.(
                      newSelection,
                      false,
                    );
                  }
                }}
                onClose={() => setSelectedAircrafts([])}
                isMobile={isMobile}
              />
            )}
          </MobileDrawer>
        ) : (
          <aside
            data-tour="flight-details"
            className={`animate-slide-in-right fixed inset-y-0 right-0 z-[10014] border-l border-white/10 bg-black/90 backdrop-blur-xl transition-[width] duration-300 ease-in-out ${
              isSidebarCollapsed
                ? "w-12"
                : `w-full ${isTablet ? "max-w-[340px]" : "max-w-[400px]"}`
            }`}
          >
            {/* Collapse/Expand toggle button */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="absolute top-1/2 -left-3 z-10 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-slate-900 text-slate-400 shadow-lg transition-colors hover:bg-slate-800 hover:text-white"
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-300 ${isSidebarCollapsed ? "rotate-180" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* Collapsed state - minimal info */}
            {isSidebarCollapsed ? (
              <div className="flex h-full flex-col items-center py-6">
                <div className="mb-4 h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee]" />
                <div
                  className="writing-vertical font-mono text-[10px] font-bold tracking-wider text-cyan-400 uppercase"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {selectedAircrafts.length === 1
                    ? selectedAircrafts[0]?.flightNo ||
                      selectedAircrafts[0]?.callsign ||
                      "N/A"
                    : `${selectedAircrafts.length} SELECTED`}
                </div>
              </div>
            ) : /* Expanded state - full sidebar content */
            selectedAircrafts.length === 1 ? (
              <Sidebar
                key={selectedAircrafts[0]!.id}
                aircraft={selectedAircrafts[0]!}
                onWaypointClick={undefined}
                onHistoryClick={(flight) => {
                  setReplayFlight(flight);
                  setHistoryPath(flight.routeData || null);
                  setIsViewingHistory(true);
                }}
                onAirportClick={handleAirportSelectByIcao}
                isMobile={isMobile}
                onClose={() => setSelectedAircrafts([])}
                isFollowMode={isFollowMode}
                onToggleFollow={() => setIsFollowMode((prev) => !prev)}
              />
            ) : (
              <MultiAircraftSidebar
                aircrafts={selectedAircrafts}
                onRemoveAircraft={(aircraft) => {
                  const aircraftId = aircraft.callsign || aircraft.id;
                  const newSelection = selectedAircrafts.filter(
                    (ac) => (ac.callsign || ac.id) !== aircraftId,
                  );
                  setSelectedAircrafts(newSelection);
                  if (newSelection.length > 0) {
                    drawMultipleFlightPlansOnMapRef.current?.(
                      newSelection,
                      false,
                    );
                  }
                }}
                onClose={() => setSelectedAircrafts([])}
                isMobile={isMobile}
              />
            )}
          </aside>
        ))}

      {!isUiHidden && showTaxiChart && selectedAirport?.icao && (
        <TaxiChartViewer
          icao={selectedAirport.icao}
          onClose={() => setShowTaxiChart(false)}
          onOpenSideView={() => {
            setChartOverlayIcao(selectedAirport.icao);
            setChartOverlayActive(true);
          }}
        />
      )}

      {!isUiHidden && chartOverlayActive && chartOverlayIcao && (
        <ChartSidePanel
          icao={chartOverlayIcao}
          onClose={() => {
            setChartOverlayActive(false);
            setChartOverlayIcao(null);
          }}
        />
      )}

      {/* Flight Replay Controls */}
      {!isUiHidden && replayFlight && (
        <FlightReplayControls
          flight={replayFlight}
          onClose={() => {
            setReplayFlight(null);
            setReplayState(null);
            setHistoryPath(null);
            setIsViewingHistory(false);
          }}
          onStateChange={setReplayState}
          isMobile={isMobile}
        />
      )}

      {/* Most Tracked Flights — tablet & desktop, hidden when airport selected */}
      {!isUiHidden && !isPhone && !selectedAirport && (
        <MostTrackedPanel
          flights={isReplayActive ? [] : mostTrackedFlights}
          onTrack={(ac) => {
            drawFlightPlanOnMapRef.current?.(ac, true);
            handleAircraftSelect(ac);
          }}
        />
      )}

      <ShortcutsMenu
        open={showShortcutsMenu && !isUiHidden}
        onClose={() => setShowShortcutsMenu(false)}
        isMobile={isMobile}
        showAircraftLabels={
          flightDisplayMode === "default" ||
          flightDisplayMode === "waypoints-hidden"
        }
        onAircraftLabelsChange={(showLabels) => {
          const showWaypoints =
            flightDisplayMode === "default" ||
            flightDisplayMode === "labels-hidden";
          setFlightDisplayMode(
            showLabels
              ? showWaypoints
                ? "default"
                : "waypoints-hidden"
              : showWaypoints
                ? "labels-hidden"
                : "minimal",
          );
        }}
        showRouteWaypoints={
          flightDisplayMode === "default" ||
          flightDisplayMode === "labels-hidden"
        }
        onRouteWaypointsChange={(showWaypoints) => {
          const showLabels =
            flightDisplayMode === "default" ||
            flightDisplayMode === "waypoints-hidden";
          setFlightDisplayMode(
            showWaypoints
              ? showLabels
                ? "default"
                : "labels-hidden"
              : showLabels
                ? "waypoints-hidden"
                : "minimal",
          );
        }}
        isHeadingMode={isHeadingMode}
        onHeadingModeChange={setIsHeadingMode}
        isUiHidden={isUiHidden}
        onUiHiddenChange={(hidden) => {
          setIsUiHidden(hidden);
          if (hidden) setShowShortcutsMenu(false);
        }}
      />
      <RadarGuide
        open={isRadarGuideOpen}
        onFinish={finishRadarGuide}
        signals={{
          hasSelectedAircraft: selectedAircrafts.length > 0,
          hasSelectedFreeChartAirport: isFreeChartIcao(selectedAirport?.icao),
          isChartOpen: showTaxiChart || chartOverlayActive,
        }}
        onOpenAircraftImages={() => {
          window.open("/aircraft-images", "_blank", "noopener,noreferrer");
        }}
        onPrepareDock={prepareRadarGuideDock}
      />
    </div>
  );
}

function MapSkeleton() {
  // Scattered aircraft positions (percentage-based)
  const dots = [
    { x: 15, y: 25 },
    { x: 22, y: 35 },
    { x: 18, y: 48 },
    { x: 30, y: 20 },
    { x: 35, y: 42 },
    { x: 28, y: 58 },
    { x: 45, y: 28 },
    { x: 52, y: 38 },
    { x: 48, y: 52 },
    { x: 58, y: 22 },
    { x: 65, y: 45 },
    { x: 62, y: 60 },
    { x: 72, y: 30 },
    { x: 78, y: 48 },
    { x: 75, y: 65 },
    { x: 85, y: 35 },
    { x: 88, y: 55 },
    { x: 82, y: 42 },
    { x: 40, y: 68 },
    { x: 55, y: 72 },
    { x: 25, y: 70 },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a1219]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.1),transparent_35%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.08),transparent_40%)]" />

      <div className="absolute inset-0 [background-image:linear-gradient(rgba(34,211,238,0.32)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.32)_1px,transparent_1px)] [background-size:72px_72px] opacity-[0.06]" />

      {/* World map background */}
      <Image
        src="/world-outline.svg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.06]"
        style={{
          filter:
            "invert(65%) sepia(70%) saturate(400%) hue-rotate(140deg) brightness(95%)",
        }}
      />

      {/* Scattered glowing dots */}
      {dots.map((dot, i) => (
        <div
          key={i}
          className="absolute h-1 w-1 animate-pulse rounded-full bg-cyan-400"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            opacity: 0.4 + (i % 3) * 0.2,
            animationDelay: `${(i * 150) % 2000}ms`,
          }}
        />
      ))}

      <div className="absolute inset-x-0 bottom-8 flex justify-center px-4">
        <div className="rounded-full border border-cyan-400/20 bg-black/45 px-4 py-2 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
            <p className="text-[11px] tracking-[0.28em] text-cyan-100/80 uppercase">
              Syncing Live Traffic
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
