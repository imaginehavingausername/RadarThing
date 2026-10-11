<p align="center">
  <img src="public/logo-white.svg" alt="RadarThing" width="200">
</p>

# RadarThing

A modern, real-time flight radar for the [GeoFS](https://www.geo-fs.com/) flight simulator. RadarThing tracks live traffic, records flight history, overlays weather and airport data, and gives pilots and controllers a cleaner operating picture than the original GeoFS radar.

## Quick Start

1. Open [radarthing.com](https://radarthing.com).
2. Install the GeoFS script from [radarthing.com/userscript](https://radarthing.com/userscript), or paste the console loader shown on the homepage into GeoFS DevTools.
3. Open [GeoFS](https://www.geo-fs.com/geofs.php) and fly normally.
4. Your aircraft appears on the radar automatically while the script is running.

Tampermonkey installs are persistent. Console installs use the same hosted loader, but they need to be run again after a full GeoFS page reload.

## Features

### Live Radar

- **Real-time aircraft stream** from the RadarThing SSE service.
- **Click-to-track** aircraft with detailed sidebar data.
- **Search and filtering** by callsign, flight number, airport, or GeoFS user.
- **Multi-aircraft selection** with side-by-side tracking.
- **Most-tracked flights** panel showing what other users are watching.
- **Follow mode** for keeping a selected aircraft centered.
- **Radar Mode** map styling for a cleaner controller view.
- **3D altitude toggle** on the existing map: a tilted camera, raised trails and translucent curtains use the same altitude colours as 2D, with aircraft icons and upright tags following the elevated flown trail, plus the existing layer switches and side controls. Heights are visually exaggerated to make altitude differences readable at every zoom; the toggle tooltip identifies estimated profiles.
- **Aircraft type icons** for common airline, regional, business, general aviation, military, and helicopter traffic.

### Pilot and Controller Tools

- **Heading Mode** for measuring headings between points on the map.
- **Remote aircraft commands** for supported clients, including speed, altitude, heading, vertical speed, squawk, flaps, NAV/HDG mode, waypoint selection, autopilot toggles, and IDENT requests.
- **Flight plan drawing** with waypoint speed and altitude details.
- **Waypoint ETAs** and remaining route distance for active flights.
- **Pilot ACARS** updates composed in the GeoFS userscript and shown in the selected aircraft sidebar.
- **Conflict alerts** with a recent review log.
- **Keyboard shortcut reference** built into the radar dock.
- **Display unit preferences** for speed and altitude.
- **Map layer presets** for saving radar layer, weather, OpenAIP, and conflict-monitor setups.

### Weather and Airport Data

- **METAR, D-ATIS, NOTAM, AIRMET, SIGMET, and precipitation layers**.
- **Airport markers, frequencies, and live ATC indicators**.
- **Airport charts** for taxi diagrams, SIDs, STARs, and approaches.
- **Chart overlays** directly on the map where supported.
- **Community chart uploads** with moderation.
- **US airport charts are free**; advanced global chart and weather access is part of RadarThing PRO.

### Flight History and Community

- **Automatic flight recording** with routes, duration, distance, max altitude, and max speed.
- **Flight replay** from the dashboard or shared radar URLs.
- **Live route viewing** before a flight has ended.
- **Shareable flight cards** for completed flights.
- **Pilot dashboard** with totals, streaks, top routes, airports, aircraft, account export, and subscription management.
- **Pilot profiles** and a leaderboard for flights, distance, time, streaks, and approved image contributions.
- **Pilot challenges** with automatic and manually reviewed goals.
- **Virtual airline support** with callsign matching, members, admins, and VA-specific aircraft images.
- **Community aircraft image uploads** and moderation.
- **Discord waypoint reminders** through the RadarThing bot.

## Free and PRO

Core tracking is free. RadarThing PRO unlocks more aviation data and analytics.

| Free                                           | PRO                                        |
| ---------------------------------------------- | ------------------------------------------ |
| Live aircraft tracking                         | Everything in Free                         |
| Search, filters, multi-select, and follow mode | Full NOTAM access with decoded text        |
| Flight recording and replay                    | AIRMET and SIGMET overlays                 |
| Remote autopilot commands                      | Global airport charts and procedures       |
| Basic flight stats                             | Full flight history and advanced analytics |
| Precipitation overlay                          | Radar Mode and chart-focused workflows     |
| Live ATC indicators and audio                  | Shareable flight cards                     |
| Aircraft image uploads                         | Subscription management through Stripe     |

## Userscript Workflow

Editable userscript source files live in:

- `userscript.js`
- `seabus.js`
- `userscript-src/radarthing-runtime.js`
- `userscript-src/config.json`
- `scripts/build-userscript.mjs`

Generated userscript files are built into `public/userscript/` and `radarthing.user.js`. Do not hand-edit or commit those generated artifacts. Rebuild them from source instead:

```bash
pnpm run build:userscript
```

To test unpublished userscript changes in GeoFS, run `pnpm run build:userscript:dev` and install the generated `radarthing.dev.user.js` in Tampermonkey. This standalone build uses the current branch code and sends ACARS requests to `http://localhost:3000`; run `pnpm dev` for the local website and API. Disable the regular RadarThing userscript while testing to avoid loading both copies. The local app needs its Convex functions and `OPENAI_API_KEY` configured for ACARS publishing.

The public install flow is:

1. `/userscript` redirects Tampermonkey users to `/userscript/radarthing.user.js`.
2. The installer loads `/loader`.
3. The loader reads `/userscript/latest.json`.
4. The current runtime bundle is loaded, with a stable bundle fallback.

ACARS entries can be published from the GeoFS panel after saving an active flight. They appear on RadarThing as soon as the pilot publishes or removes them. Set the server-only `OPENAI_API_KEY` in the Next.js deployment to screen text before publication; publishing fails closed while screening is unavailable. Viewer reports and blocked submissions are reviewed at `/admin/acars-moderation`.

## Attribution

Aircraft SVG icons in `public/icons/aircraft/adsb-radar/` are by ADS-B Radar for macOS: [https://adsb-radar.com](https://adsb-radar.com), [App Store listing](https://apps.apple.com/app/id1538149835).

## Technical Details

**App:** Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn-style UI components

**Data:** Convex for users, flight history, charts, aircraft images, virtual airlines, challenges, and moderation data

**Realtime:** SSE traffic stream served by the companion `../radar-sse` service

**Mapping:** Leaflet with custom aircraft markers, weather overlays, chart overlays, and map layer presets

**Auth and billing:** Clerk, Stripe, UploadThing, Resend, and PostHog

## Development

Install dependencies:

```bash
pnpm install
```

If pnpm is not installed yet, enable it through Corepack first:

```bash
corepack enable
```

Run checks:

```bash
pnpm lint
pnpm typecheck
pnpm run check
```

Format code:

```bash
pnpm run format:write
```

Supporting services:

```bash
pnpm run cf       # Cloudflare tunnel
pnpm run stripe   # Stripe webhook listener
```

Convex development:

```bash
pnpm run convex:dev
```

After changing files in `convex/`, run Convex locally and deploy the Convex changes with the project deploy process.

## Convex Backups

Production Convex backups are exported by the `Convex Backup` GitHub Actions workflow and uploaded to UploadThing.

UploadThing free apps do not allow private files, so backups are encrypted locally before upload and stored as `.zip.enc` files. Treat `BACKUP_ENCRYPTION_KEY` like a production database password: keep it in a password manager. If this key is lost, existing encrypted backups cannot be restored.

Backup filenames are target-aware and human-readable, for example:

```text
radarthing-prod-db-only-2026-05-07_08-00-00Z.zip.enc
radarthing-prod-db-and-files-2026-05-07_08-00-00Z.zip.enc
```

Required GitHub Actions repository secrets:

```text
CONVEX_DEPLOY_KEY
UPLOADTHING_TOKEN
BACKUP_ENCRYPTION_KEY
```

Generate the encryption key with:

```bash
openssl rand -base64 48
```

Trigger a manual backup from GitHub:

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **Convex Backup**.
4. Click **Run workflow**.

The workflow runs daily at `08:00 UTC` and prunes encrypted UploadThing backups older than 30 days.

Run the backup locally:

```bash
pnpm run backup:convex -- --label prod --retention-days 30
```

Sync production data into the default Convex dev deployment for local testing:

```bash
pnpm run sync:convex:prod-to-dev
```

The sync script exports a backup of the current dev deployment first, then
replaces the default dev deployment with production data via
`convex import --replace-all`. It refuses to run if `CONVEX_DEPLOY_KEY` is set.

Include Convex file storage:

```bash
pnpm run backup:convex -- --label prod --include-file-storage --retention-days 30
```

Decrypt a downloaded backup:

```bash
BACKUP_ENCRYPTION_KEY="<same key used for backups>" pnpm run backup:convex -- \
  --decrypt ./radarthing-prod-db-only-2026-05-07_08-00-00Z.zip.enc \
  --output ./radarthing-prod-db-only-2026-05-07_08-00-00Z.zip
```

Restore with Convex after decrypting, preferably into a non-production deployment first:

```bash
pnpm exec convex import ./radarthing-prod-db-only-2026-05-07_08-00-00Z.zip
```

## Environment Variables

Environment variables are validated in `src/env.js` using T3 Env. Server-side variables include Clerk, Stripe, UploadThing, and Resend keys. Client-side variables must use the `NEXT_PUBLIC_` prefix. Add new variables to `.env.example` when introducing them.

## Issues and Feedback

Found a bug or have a suggestion? Open an issue on [GitHub](https://github.com/mansoorbarri/RadarThing/issues) or join the RadarThing Discord from the homepage.

## Public guides

Guide copy lives in `content/guides/*.md` as plain Markdown. Edit those files to update the public `/guides/[slug]` pages; JSX is not needed for article content. The server renders Markdown with `react-markdown` (raw HTML is not enabled).

To add a guide, create a Markdown file with one H1 title and add its slug, title, and description to `src/lib/guides.ts`. That registry drives navigation, static routes, metadata, and sitemap entries. Use root-relative links for site pages. Check instructions against the current UI and subscription limits before publishing.
