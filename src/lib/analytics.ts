import posthog from "posthog-js";

// Type-safe event definitions
type UserRole = "FREE" | "PRO" | "ADMIN";

// Event property types
interface BaseEventProps {
  timestamp?: number;
}

interface AircraftEventProps extends BaseEventProps {
  callsign: string;
  aircraftType?: string;
}

interface SearchEventProps extends BaseEventProps {
  query: string;
  resultCount?: number;
}

interface FeatureAccessProps extends BaseEventProps {
  feature: string;
  hasAccess: boolean;
}

interface WeatherLayerProps extends BaseEventProps {
  layer: "precipitation" | "airmet" | "sigmet" | "notam";
  enabled: boolean;
}

interface FlightEventProps extends BaseEventProps {
  callsign: string;
  aircraftType: string;
  depICAO?: string;
  arrICAO?: string;
}

interface FlightReplayEventProps extends BaseEventProps {
  callsign?: string;
  aircraftType?: string;
  depICAO?: string;
  arrICAO?: string;
  duration?: number;
}

interface AccountDataExportEventProps extends BaseEventProps {
  source: string;
  flightCount?: number;
}

interface AccountActionEventProps extends BaseEventProps {
  source: string;
}

interface AccountNameUpdatedEventProps extends AccountActionEventProps {
  hasFirstName: boolean;
  hasLastName: boolean;
}

interface FlightReplaySpeedProps extends FlightReplayEventProps {
  speed: number;
}

interface CheckoutEventProps extends BaseEventProps {
  priceId?: string;
  source?: string;
}

interface ImageEventProps extends BaseEventProps {
  airlineIata: string;
  airlineIcao: string;
  aircraftType: string;
}

interface AirportEventProps extends BaseEventProps {
  icao: string;
}

interface MapEventProps extends BaseEventProps {
  mode?: string;
  zoomLevel?: number;
}

interface ConflictLayerProps extends BaseEventProps {
  enabled: boolean;
}

interface ConflictSnapshotProps extends BaseEventProps {
  total: number;
  high: number;
  medium: number;
  low: number;
}

interface TimeDisplayPreferenceProps extends BaseEventProps {
  mode: "utc" | "local";
}

interface WhatsNewEventProps extends BaseEventProps {
  had_unread?: boolean;
  entry_id?: string;
}

interface ShortcutsEventProps extends BaseEventProps {
  source?: string;
}

const RECENT_EXCEPTION_TTL_MS = 5000;
const recentExceptionCaptures = new Map<string, number>();

function getExceptionSignature(
  error: unknown,
  properties?: Record<string, unknown>,
): string {
  const source =
    typeof properties?.source === "string" ? properties.source : "unknown";

  if (error instanceof Error) {
    const stackTop = error.stack?.split("\n").slice(0, 3).join("\n") ?? "";
    return `${source}|${error.name}|${error.message}|${stackTop}`;
  }

  return `${source}|${String(error)}`;
}

function shouldCaptureException(
  error: unknown,
  properties?: Record<string, unknown>,
): boolean {
  const now = Date.now();

  for (const [signature, timestamp] of recentExceptionCaptures.entries()) {
    if (now - timestamp > RECENT_EXCEPTION_TTL_MS) {
      recentExceptionCaptures.delete(signature);
    }
  }

  const signature = getExceptionSignature(error, properties);
  const lastCapturedAt = recentExceptionCaptures.get(signature);

  if (lastCapturedAt && now - lastCapturedAt < RECENT_EXCEPTION_TTL_MS) {
    return false;
  }

  recentExceptionCaptures.set(signature, now);
  return true;
}

// All analytics events
export const Analytics = {
  // Initialize PostHog (only in production)
  init: () => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false, // Manual tracking for better control
      // We capture exceptions ourselves so we can attach custom client context
      // and avoid duplicate reports from multiple browser hooks.
      capture_exceptions: false,
      error_tracking: {
        captureExtensionExceptions: false,
      },
      session_recording: {
        maskAllInputs: true,
      },
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      respect_dnt: true,
    });
  },

  optIn: () => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;
    posthog.opt_in_capturing();
  },

  optOut: () => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;
    if (!posthog.__loaded) return;
    posthog.reset();
    posthog.persistence?.clear();
    posthog.sessionPersistence?.clear();
    posthog.opt_out_capturing();
  },

  // Identify user with their properties
  identify: (
    userId: string,
    properties: {
      email?: string;
      role: UserRole;
      googleId?: string;
      stripeCustomerId?: string;
    },
  ) => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;

    posthog.identify(userId, {
      email: properties.email,
      role: properties.role,
      is_pro: properties.role === "PRO" || properties.role === "ADMIN",
      is_admin: properties.role === "ADMIN",
      google_id: properties.googleId,
      stripe_customer_id: properties.stripeCustomerId,
    });
  },

  // Reset on logout
  reset: () => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;

    posthog.reset();
  },

  // ===== AIRCRAFT EVENTS =====
  aircraftSelected: (props: AircraftEventProps) => {
    track("aircraft_selected", props);
  },

  aircraftSearched: (props: SearchEventProps) => {
    track("aircraft_searched", props);
  },

  aircraftFiltered: (props: { prefix: string }) => {
    track("aircraft_filtered", props);
  },

  // ===== FLIGHT EVENTS =====
  flightStarted: (props: FlightEventProps) => {
    track("flight_started", props);
  },

  flightEnded: (
    props: FlightEventProps & { duration?: number; maxAltitude?: number },
  ) => {
    track("flight_ended", props);
  },

  flightHistoryViewed: (props?: BaseEventProps) => {
    track("flight_history_viewed", props);
  },

  flightReplayStarted: (props: FlightReplayEventProps) => {
    track("flight_replay_started", props);
  },

  flightReplayPaused: (props: FlightReplayEventProps) => {
    track("flight_replay_paused", props);
  },

  flightReplaySpeedChanged: (props: FlightReplaySpeedProps) => {
    track("flight_replay_speed_changed", props);
  },

  flightReplayCompleted: (props: FlightReplayEventProps) => {
    track("flight_replay_completed", props);
  },

  flightReplayClosed: (props: FlightReplayEventProps) => {
    track("flight_replay_closed", props);
  },

  flightReplayShared: (
    props: FlightReplayEventProps & { flightId: string },
  ) => {
    track("flight_replay_shared", props);
  },

  flightDeleted: (props: {
    flightId: string;
    source: string;
    targetUserId?: string;
    callsign?: string;
    aircraftType: string;
    depICAO?: string;
    arrICAO?: string;
  }) => {
    track("flight_deleted", props);
  },

  accountDataExportClicked: (props: AccountDataExportEventProps) => {
    track("account_data_export_clicked", props);
  },

  accountDataExportDownloaded: (props: AccountDataExportEventProps) => {
    track("account_data_export_downloaded", props);
  },

  accountNameEditOpened: (props: AccountActionEventProps) => {
    track("account_name_edit_opened", props);
  },

  accountNameUpdated: (props: AccountNameUpdatedEventProps) => {
    track("account_name_updated", props);
  },

  // ===== FEATURE ACCESS EVENTS =====
  featureAccessed: (props: FeatureAccessProps) => {
    track("feature_accessed", props);
  },

  proFeatureBlocked: (props: { feature: string }) => {
    track("pro_feature_blocked", props);
  },

  // ===== WEATHER LAYER EVENTS =====
  weatherLayerToggled: (props: WeatherLayerProps) => {
    track("weather_layer_toggled", props);
  },

  // ===== MAP EVENTS =====
  mapLoaded: (props?: MapEventProps) => {
    track("map_loaded", props);
  },

  mapModeChanged: (props: { mode: string }) => {
    track("map_mode_changed", props);
  },

  headingModeToggled: (props: { enabled: boolean; callsign?: string }) => {
    track("heading_mode_toggled", props);
  },

  conflictLayerToggled: (props: ConflictLayerProps) => {
    track("conflict_layer_toggled", props);
  },

  conflictMonitorViewed: (props?: BaseEventProps) => {
    track("conflict_monitor_viewed", props);
  },

  conflictSnapshotUpdated: (props: ConflictSnapshotProps) => {
    track("conflict_snapshot_updated", props);
  },

  timeDisplayPreferenceChanged: (props: TimeDisplayPreferenceProps) => {
    track("time_display_preference_changed", props);
  },

  // ===== AIRPORT EVENTS =====
  airportSelected: (props: AirportEventProps) => {
    track("airport_selected", props);
  },

  taxiChartViewed: (props: AirportEventProps & { hasAccess: boolean }) => {
    track("taxi_chart_viewed", props);
  },

  // ===== PRICING & MONETIZATION =====
  pricingPageViewed: (props?: BaseEventProps) => {
    track("pricing_page_viewed", props);
  },

  upgradeButtonClicked: (props: { source: string; feature?: string }) => {
    track("upgrade_button_clicked", props);
  },

  checkoutStarted: (props: CheckoutEventProps) => {
    track("checkout_started", props);
  },

  checkoutCompleted: (props?: CheckoutEventProps) => {
    track("checkout_completed", props);
  },

  subscriptionCancelled: (props?: BaseEventProps) => {
    track("subscription_cancelled", props);
  },

  // ===== LEADERBOARD EVENTS =====
  leaderboardViewed: (props?: BaseEventProps) => {
    track("leaderboard_viewed", props);
  },

  leaderboardIconClicked: (props?: BaseEventProps) => {
    track("leaderboard_icon_clicked", props);
  },

  // ===== DASHBOARD EVENTS =====
  dashboardViewed: (props?: BaseEventProps) => {
    track("dashboard_viewed", props);
  },

  statsCalculated: (props: {
    totalFlights?: number;
    totalDistance?: number;
    totalTime?: number;
  }) => {
    track("stats_calculated", props);
  },

  // ===== AIRCRAFT IMAGE EVENTS =====
  imageGalleryViewed: (props?: BaseEventProps) => {
    track("image_gallery_viewed", props);
  },

  imageUploadStarted: (props: ImageEventProps) => {
    track("image_upload_started", props);
  },

  imageUploadCompleted: (props: ImageEventProps) => {
    track("image_upload_completed", props);
  },

  imageSearched: (props: SearchEventProps) => {
    track("image_searched", props);
  },

  // ===== AUTH EVENTS =====
  signedIn: (props?: { method?: string }) => {
    track("signed_in", props);
  },

  signedOut: (props?: BaseEventProps) => {
    track("signed_out", props);
  },

  // ===== AIRCRAFT CONTROL EVENTS =====
  controlSet: (props: {
    control: string;
    callsign?: string;
    value?: string | number;
  }) => {
    track("control_set", props);
  },

  controlSetAll: (props: { callsign?: string; controls?: string[] }) => {
    track("control_set_all", props);
  },

  flightDisconnected: (props: { callsign?: string }) => {
    track("flight_disconnected", props);
  },

  // ===== MOST TRACKED EVENTS =====
  mostTrackedFlightClicked: (props: {
    callsign: string;
    trackerCount: number;
    rank: number;
  }) => {
    track("most_tracked_flight_clicked", props);
  },

  // ===== WHATS NEW EVENTS =====
  whatsNewOpened: (props: WhatsNewEventProps) => {
    track("whats_new_opened", props);
  },

  whatsNewToastShown: (props?: WhatsNewEventProps) => {
    track("whats_new_toast_shown", props);
  },

  whatsNewToastClicked: (props?: WhatsNewEventProps) => {
    track("whats_new_toast_clicked", props);
  },

  shortcutsOpened: (props?: ShortcutsEventProps) => {
    track("shortcuts_opened", props);
  },

  // ===== FLIGHT CARD EVENTS =====
  flightCardOpened: (props: {
    callsign?: string;
    aircraftType?: string;
    depICAO?: string;
    arrICAO?: string;
    hasRoute: boolean;
    source: string;
  }) => {
    track("flight_card_opened", props);
  },

  flightCardDownloaded: (props: {
    callsign?: string;
    aircraftType?: string;
    depICAO?: string;
    arrICAO?: string;
    hasRoute: boolean;
  }) => {
    track("flight_card_downloaded", props);
  },

  flightCardCopied: (props: {
    callsign?: string;
    aircraftType?: string;
    depICAO?: string;
    arrICAO?: string;
    hasRoute: boolean;
  }) => {
    track("flight_card_copied", props);
  },

  // ===== GENERIC EVENT =====
  track: (eventName: string, properties?: Record<string, unknown>) => {
    track(eventName, properties);
  },

  captureException: (error: unknown, properties?: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;
    if (!shouldCaptureException(error, properties)) return;

    posthog.captureException(error, {
      ...properties,
      timestamp: Date.now(),
    });
  },
};

// Internal tracking function with dev guard
function track(eventName: string, properties?: object) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") return;

  posthog.capture(eventName, {
    ...properties,
    timestamp: Date.now(),
  });
}
