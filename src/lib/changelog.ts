export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  description: string;
  type: "new" | "improvement" | "fix";
}

export const changelog: ChangelogEntry[] = [
  {
    id: "radar-tour",
    date: "2026-08-25",
    title: "Radar Tour",
    description: "Take a one-time guided tour of RadarThing's core features.",
    type: "new",
  },
  {
    id: "mobile-userscript-panel-controls",
    date: "2026-07-15",
    title: "Mobile Flight Panel Controls",
    description:
      "On mobile, you can now close the userscript's ATC Flight Info panel and reopen it anytime from a compact on-screen button.",
    type: "improvement",
  },
  {
    id: "mobile-radar-controls",
    date: "2026-07-14",
    title: "Mobile Radar Quick Controls",
    description:
      "The radar controls menu now offers mobile toggles for following aircraft, labels, route waypoints, heading mode, and the radar UI. Press L on desktop to cycle flight display modes.",
    type: "new",
  },
  {
    id: "virtual-airline-registration-approval",
    date: "2026-07-13",
    title: "Virtual Airline Registration Approval",
    description:
      "You can now submit a virtual airline registration for review. Administrators can approve or reject requests, and rejected applications include feedback by email.",
    type: "new",
  },
  {
    id: "dashboard-privacy-blur",
    date: "2026-06-24",
    title: "Dashboard Privacy Blur",
    description:
      "Blur your dashboard name, email, and avatar from Account settings.",
    type: "new",
  },
  {
    id: "stats-rules-modal",
    date: "2026-06-15",
    title: "Stats Rules in the Radar Dock",
    description:
      "The radar dock now includes a Stats Rules modal explaining why a flight may stay in history but not count toward user stats.",
    type: "new",
  },
  {
    id: "dashboard-flight-delete",
    date: "2026-05-14",
    title: "Delete Flights from Dashboard",
    description:
      "Delete your own flights from the dashboard with a confirmation prompt.",
    type: "new",
  },
  {
    id: "challenge-leaderboard-tab",
    date: "2026-05-12",
    title: "Challenge Leaderboard Tab",
    description:
      "The leaderboard now includes a Challenges tab with top 10 rankings for every active pilot challenge.",
    type: "new",
  },
  {
    id: "flight-resume-recovery",
    date: "2026-05-11",
    title: "Flight Resume Recovery",
    description:
      "Unexpected disconnects can now be resumed later from a top-center userscript prompt, while Clear and Disconnect still end flights instantly.",
    type: "improvement",
  },
  {
    id: "flight-history-search",
    date: "2026-05-09",
    title: "Smoother Flight History",
    description:
      "Flight history now loads faster with 10-per-page browsing and fuzzy search across routes, callsigns, aircraft, dates, and times.",
    type: "improvement",
  },
  {
    id: "flight-plan-imports",
    date: "2026-05-08",
    title: "Flight Plan Imports",
    description:
      "Import a flight plan JSON from the dock to preview the full route, waypoint altitudes, speeds, distance, and ETA.",
    type: "new",
  },
  {
    id: "airport-activity-explorer",
    date: "2026-05-04",
    title: "Airport Activity Explorer",
    description:
      "The radar dock now includes a live airport activity board with search, traffic and staffing sorting, route rankings, and one-click airport drill-in.",
    type: "new",
  },
  {
    id: "conflict-review-log",
    date: "2026-04-18",
    title: "Conflict Review Log",
    description:
      "Conflict alerts now keep a recent event log with a review button in the conflict monitor.",
    type: "new",
  },
  {
    id: "map-layer-presets",
    date: "2026-04-17",
    title: "Map Layer Presets",
    description:
      "You can now save your radar setup with presets. Set one in the radar settings icon.",
    type: "new",
  },
  {
    id: "pilot-challenges",
    date: "2026-04-17",
    title: "Pilot Challenges",
    description:
      "Admins can now publish weekly or monthly pilot challenges, with automatic tracking for flight-based goals and manual review for custom ones.",
    type: "new",
  },
  {
    id: "shortcuts-menu",
    date: "2026-04-12",
    title: "Shortcut Reference Menu",
    description:
      "The radar dock now includes a Shortcuts menu so you can quickly see the available keyboard and mouse controls.",
    type: "new",
  },
  {
    id: "virtual-airlines",
    date: "2026-04-04",
    title: "VAs are now supported!",
    description: "Message @xyzmani on Discord to register yours!",
    type: "new",
  },
  {
    id: "replay-hides-live-traffic",
    date: "2026-04-02",
    title: "Cleaner Flight Replays",
    description:
      "Live traffic is now hidden while you replay a flight, so the route playback stays isolated from current radar traffic.",
    type: "fix",
  },
  {
    id: "free-us-airport-charts",
    date: "2026-03-31",
    title: "US Airport Charts Are Now Free",
    description:
      "Airport charts for US airports are now available to every user on the radar without a PRO subscription.",
    type: "improvement",
  },
  {
    id: "sidebar-nav-waypoint-controls",
    date: "2026-03-29",
    title: "Sidebar NAV and Waypoint Controls",
    description:
      "Your own aircraft sidebar now lets you switch between NAV and HDG mode, and NAV mode can retarget a specific waypoint from the active flight plan.",
    type: "improvement",
  },
  {
    id: "heading-mode-keybind",
    date: "2026-03-28",
    title: "Heading Mode Keybind",
    description:
      "You can now press T on the radar to enter Heading Mode without clicking the map control.",
    type: "improvement",
  },
  {
    id: "discord-waypoint-reminders",
    date: "2026-03-23",
    title: "Discord Waypoint Reminders",
    description:
      "You can now use the Discord bot to schedule waypoint reminders for your live flight and get pinged on your chosen interval after the trigger point.",
    type: "new",
  },
  {
    id: "live-flight-paths",
    date: "2026-03-23",
    title: "Mid-Flight Route Viewing",
    description:
      "Selected flights can now expose the route flown so far before landing, so you no longer have to wait for a flight to end to inspect its track.",
    type: "improvement",
  },
  {
    id: "military-helicopter-icons",
    date: "2026-03-21",
    title: "Military and Helicopter Icons",
    description:
      "Military aircraft now use the A6 marker silhouette on the radar, and helicopters use the A7 silhouette.",
    type: "improvement",
  },
  {
    id: "aircraft-class-icons",
    date: "2026-03-20",
    title: "Aircraft Class Icons",
    description:
      "Live aircraft on the radar now use different marker silhouettes for classes like light, regional, heavy, super, business, and military traffic.",
    type: "improvement",
  },
  {
    id: "leaderboard-contributions-tab",
    date: "2026-03-18",
    title: "Contribution Leaderboard",
    description:
      "The leaderboard now includes a Contribution tab so you can rank users by approved aircraft image contributions.",
    type: "new",
  },
  {
    id: "display-units-customizer",
    date: "2026-03-08",
    title: "Display Units Customizer",
    description:
      "Choose your preferred units in Radar Configuration. Switch speed between knots and Mach, and altitude between feet, flight levels, or auto. Upload Aircraft Images has also moved to the dock for easier access.",
    type: "new",
  },
  {
    id: "shareable-flight-cards",
    date: "2026-03-03",
    title: "Shareable Flight Cards",
    description:
      "PRO users can now generate beautiful flight summary card images from their flight history. Perfect for sharing your flights on Discord and social media.",
    type: "new",
  },
  {
    id: "live-atc-indicator",
    date: "2025-02-25",
    title: "Live ATC on the radar",
    description:
      "Airports with active ATC from ATCThing now show a live green indicator directly on the map. Click it to join the controller's Discord.",
    type: "new",
  },
];

// Use the visitor's calendar date so scheduled entries become visible when
// their day begins in that visitor's time zone.
const now = new Date();
const CURRENT_CHANGELOG_MONTH = `${now.getFullYear()}-${String(
  now.getMonth() + 1,
).padStart(2, "0")}`;
const CURRENT_CHANGELOG_DATE = `${CURRENT_CHANGELOG_MONTH}-${String(
  now.getDate(),
).padStart(2, "0")}`;

export const currentMonthChangelog = changelog.filter(
  (entry) =>
    entry.date.startsWith(CURRENT_CHANGELOG_MONTH) &&
    entry.date <= CURRENT_CHANGELOG_DATE,
);

export const CURRENT_CHANGELOG_MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${CURRENT_CHANGELOG_MONTH}-01T00:00:00Z`));

export const LATEST_CHANGELOG_ID = currentMonthChangelog[0]?.id ?? null;
