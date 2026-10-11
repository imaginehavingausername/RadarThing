/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acars from "../acars.js";
import type * as activeFlightSessions from "../activeFlightSessions.js";
import type * as activeTrackers from "../activeTrackers.js";
import type * as adminTelemetry from "../adminTelemetry.js";
import type * as aircraftImages from "../aircraftImages.js";
import type * as airportCharts from "../airportCharts.js";
import type * as challenges from "../challenges.js";
import type * as crons from "../crons.js";
import type * as flights from "../flights.js";
import type * as lib_airlineCodes from "../lib/airlineCodes.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_challengeRules from "../lib/challengeRules.js";
import type * as lib_flightSummaries from "../lib/flightSummaries.js";
import type * as lib_icaoRegions from "../lib/icaoRegions.js";
import type * as lib_moderationRules from "../lib/moderationRules.js";
import type * as moderation from "../moderation.js";
import type * as moderationEmail from "../moderationEmail.js";
import type * as users from "../users.js";
import type * as virtualAirlineAircraftImages from "../virtualAirlineAircraftImages.js";
import type * as virtualAirlineMembers from "../virtualAirlineMembers.js";
import type * as virtualAirlines from "../virtualAirlines.js";
import type * as waypointReminders from "../waypointReminders.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acars: typeof acars;
  activeFlightSessions: typeof activeFlightSessions;
  activeTrackers: typeof activeTrackers;
  adminTelemetry: typeof adminTelemetry;
  aircraftImages: typeof aircraftImages;
  airportCharts: typeof airportCharts;
  challenges: typeof challenges;
  crons: typeof crons;
  flights: typeof flights;
  "lib/airlineCodes": typeof lib_airlineCodes;
  "lib/auth": typeof lib_auth;
  "lib/challengeRules": typeof lib_challengeRules;
  "lib/flightSummaries": typeof lib_flightSummaries;
  "lib/icaoRegions": typeof lib_icaoRegions;
  "lib/moderationRules": typeof lib_moderationRules;
  moderation: typeof moderation;
  moderationEmail: typeof moderationEmail;
  users: typeof users;
  virtualAirlineAircraftImages: typeof virtualAirlineAircraftImages;
  virtualAirlineMembers: typeof virtualAirlineMembers;
  virtualAirlines: typeof virtualAirlines;
  waypointReminders: typeof waypointReminders;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
