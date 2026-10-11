# Account moderation

Admins can warn or ban linked RadarThing accounts from `/admin/moderation`. Moderation identifies users and admins only by Discord username (when available) or the full RT account ID shown on the dashboard. Search accepts Discord usernames and RT IDs only, not email, Google ID, or Clerk ID. Moderation queries return explicitly selected fields, and legacy email-based labels are redacted in histories and moderation Activity events. Recipient email addresses stay internal to the notification worker. Reasons are required and shared with the affected user. Users without a linked RT account cannot be moderated or emailed.

Regular admins see their own actions in the moderation history and can inspect a target's previous actions before issuing another. Only the super-admin can revoke warnings or lift bans, including their own actions. Only the super-admin can moderate other admins. Self-moderation and moderation of the super-admin are blocked on the server.

Bans have no automatic expiry. They block authenticated site use, uploads, mutations, account-associated flight persistence, tracking, and reminders. Existing browser sessions receive the ban reactively. The ban page retains account management, subscription management, data export, and sign-out. Bans do not cancel subscriptions or change account roles. Public information remains accessible while signed out; this is an account ban, not an IP/device ban.

Warnings do not restrict access. Pending warnings appear on the next full RT visit/reload or account sign-in, using the server timestamp from that visit's initial status snapshot. Navigating between pages within the same visit does not start a new session. Each warning remains pending until acknowledged; acknowledgment does not revoke it. Revoked warnings are omitted from pending notices.

## Pilot ACARS

GeoFS pilots need a linked RadarThing account to register an ACARS device and publish entries during an active flight. Text is screened by the OpenAI Moderation API before publication. Flagged entries are rejected and logged for admin review. Screening failures also prevent publication. An atomic 30-second reservation limits screening attempts. Signed-in viewers can report published entries. Admins review paged blocked entries and reports at `/admin/acars-moderation`, remove reported entries, release device claims by RT ID, and use the existing warning and ban controls. Historical entries from unlinked pilots remain visible as "Unlinked pilot" in admin review, without account moderation controls. New device claims are limited to eight attempts per IP per hour; existing device registrations remain idempotent. The rate limit stores a secret-hashed IP identifier. A GeoFS userscript cannot provide a trusted ownership token, so ACARS device registration identifies the browser but does not cryptographically prove ownership of the linked GeoFS account.

## Deployment

- Deploy the Convex schema/functions and the Next.js app together. Deploy Convex first: the updated app calls the new moderation functions. Refresh existing clients after deployment because account synchronization now runs through a trusted server action.
- Set `RESEND_API_KEY` in the **Convex deployment environment**, as well as the existing Next.js environment. Scheduled moderation email jobs execute in Convex. The sender remains `RadarThing <noreply@radarthing.com>` and must be verified with Resend.
- Keep `CONVEX_SYSTEM_SECRET` identical in Next.js and Convex. Account synchronization verifies Google identity using Clerk's server API; the browser can no longer supply authorization identity fields directly.
- New schema fields are optional for existing accounts; no account backfill is needed.

Each moderation action, audit entry, ban-state update, and email schedule is committed in one Convex mutation. Original actions are preserved on override. Admin Activity includes actions from former/deleted admins.

Emails use a stable Resend idempotency key per moderation action. Failed attempts retry with exponential backoff, up to six attempts, within the provider's [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). History displays pending/failed status, attempt count, and a generic failure notice. Detailed delivery errors remain internal. “Sent to provider” means Resend accepted the request; inbox delivery/bounce tracking is not implied. Exhausted failures remain visible for investigation and are not automatically retried outside the deduplication window.

## Validation

Run `pnpm test:moderation`, `pnpm exec tsx --test convex/activeFlightSessions.test.ts convex/flightSummaries.test.ts convex/challengeRules.test.ts`, `pnpm check`, and `pnpm build`.

Before release, use dedicated test accounts to verify admin moderation actions, warning emails and next-visit acknowledgment, an already-open session receiving a ban, blocked direct requests, account/billing access, and super-admin overrides. Automated handler tests use an in-memory database and mock the email provider; they never moderate real accounts or send email.
