import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    role: v.union(v.literal("FREE"), v.literal("PRO"), v.literal("ADMIN")),
    isDeleted: v.boolean(),
    activeBanId: v.optional(v.id("moderationActions")),
    createdAt: v.optional(v.number()),
    radarGuideCompletedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()), // timestamp
    googleId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    adminProExpiresAt: v.optional(v.number()),
    discordUsername: v.optional(v.string()),
    discordUsernameLower: v.optional(v.string()),
    // Discord's immutable user ID is required for server role management.
    discordUserId: v.optional(v.string()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_googleId", ["googleId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_discordUsernameLower", ["discordUsernameLower"]),

  moderationActions: defineTable({
    targetUserId: v.id("users"),
    targetLabel: v.string(),
    targetEmail: v.string(),
    actorUserId: v.id("users"),
    actorLabel: v.string(),
    kind: v.union(v.literal("warn"), v.literal("ban")),
    reason: v.string(),
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    revokedByLabel: v.optional(v.string()),
    revokeReason: v.optional(v.string()),
    requestId: v.string(),
    emailStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    emailAttempts: v.number(),
    emailLastError: v.optional(v.string()),
    emailSentAt: v.optional(v.number()),
  })
    .index("by_actor_createdAt", ["actorUserId", "createdAt"])
    .index("by_target_createdAt", ["targetUserId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_actor_request", ["actorUserId", "requestId"])
    .index("by_target_pending", [
      "targetUserId",
      "kind",
      "revokedAt",
      "acknowledgedAt",
    ]),

  adminTelemetry: defineTable({
    actorClerkId: v.string(),
    actorUserId: v.optional(v.id("users")),
    actorEmail: v.optional(v.string()),
    actorDiscordUsername: v.optional(v.string()),
    action: v.union(
      v.literal("upload"),
      v.literal("approve"),
      v.literal("reject"),
      v.literal("edit"),
      v.literal("delete"),
      v.literal("create"),
      v.literal("grant_pro"),
      v.literal("revoke_pro"),
      v.literal("warn"),
      v.literal("ban"),
      v.literal("revoke_warning"),
      v.literal("lift_ban"),
    ),
    resourceType: v.union(
      v.literal("aircraft_image"),
      v.literal("airport_chart"),
      v.literal("virtual_airline"),
      v.literal("pro_access"),
      v.literal("user_moderation"),
    ),
    resourceId: v.string(),
    resourceLabel: v.string(),
    targetClerkId: v.optional(v.string()),
    targetEmail: v.optional(v.string()),
    targetDiscordUsername: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_actorClerkId_createdAt", ["actorClerkId", "createdAt"])
    .index("by_resourceType_createdAt", ["resourceType", "createdAt"]),

  flights: defineTable({
    userId: v.id("users"),
    callsign: v.string(),
    aircraftType: v.string(),
    depICAO: v.optional(v.string()),
    arrICAO: v.optional(v.string()),
    squawk: v.optional(v.string()),
    duration: v.optional(v.number()), // milliseconds
    maxAltitude: v.optional(v.number()), // feet
    maxSpeed: v.optional(v.number()), // knots
    statsExcludedReason: v.optional(v.string()),
    // Legacy [lat, lon] points or extended
    // [lat, lon, altMSL, speed, heading, verticalSpeed, timestamp] samples.
    routeData: v.optional(v.any()),
    startTime: v.number(), // timestamp
    endTime: v.optional(v.number()), // timestamp
    dedupeKey: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_startTime", ["userId", "startTime"])
    .index("by_startTime", ["startTime"])
    .index("by_dedupeKey", ["dedupeKey"]),

  activeFlightSessions: defineTable({
    userId: v.id("users"),
    state: v.union(v.literal("active"), v.literal("disconnected")),
    originalId: v.string(),
    session: v.any(),
    disconnectedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_updatedAt", ["updatedAt"]),

  userStats: defineTable({
    userId: v.id("users"),
    totalFlights: v.number(),
    totalFlightTimeMs: v.number(),
    totalDistanceNm: v.number(),
    approvedAircraftImages: v.optional(v.number()),
    streakAtLastFlight: v.number(),
    longestStreak: v.number(),
    lastFlightDate: v.optional(v.string()), // YYYY-MM-DD UTC
    lastFlightStartTime: v.optional(v.number()),
    lastFlightCallsign: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  aircraftImages: defineTable({
    airlineIata: v.string(), // 2-letter IATA code (e.g., "EK") or "MIL" for military
    airlineIcao: v.string(), // 3-letter ICAO code (e.g., "UAE") or AF name (e.g., "USAF")
    aircraftType: v.string(),
    imageUrl: v.string(),
    imageKey: v.optional(v.string()), // UploadThing file key for deletion
    discordUsername: v.optional(v.string()), // Legacy submitted value; no new writes.
    isMilitary: v.optional(v.boolean()), // true for military aircraft (AF name stored in airlineIcao)
    isApproved: v.boolean(),
    uploadedBy: v.string(), // Clerk user ID
    approvedBy: v.optional(v.string()), // Clerk user ID
    approvedAt: v.optional(v.number()), // timestamp
  })
    .index("by_airlineIata", ["airlineIata"])
    .index("by_airlineIcao", ["airlineIcao"])
    .index("by_aircraftType", ["aircraftType"])
    .index("by_isApproved", ["isApproved"])
    .index("by_uploadedBy", ["uploadedBy"])
    .index("by_iata_aircraft_approved", [
      "airlineIata",
      "aircraftType",
      "isApproved",
    ])
    .index("by_icao_aircraft_approved", [
      "airlineIcao",
      "aircraftType",
      "isApproved",
    ])
    .index("by_iata_icao_aircraft_approved", [
      "airlineIata",
      "airlineIcao",
      "aircraftType",
      "isApproved",
    ]),

  virtualAirlines: defineTable({
    name: v.string(),
    callsignPrefix: v.string(),
    adminClerkId: v.string(),
    website: v.optional(v.string()),
    isActive: v.boolean(),
    approvalStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    rejectionReason: v.optional(v.string()),
    createdBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_callsignPrefix", ["callsignPrefix"])
    .index("by_adminClerkId", ["adminClerkId"])
    .index("by_isActive", ["isActive"]),

  virtualAirlineAircraftImages: defineTable({
    virtualAirlineId: v.id("virtualAirlines"),
    aircraftType: v.string(),
    imageUrl: v.string(),
    imageKey: v.optional(v.string()),
    uploadedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_virtualAirlineId", ["virtualAirlineId"])
    .index("by_virtualAirlineId_aircraftType", [
      "virtualAirlineId",
      "aircraftType",
    ]),

  virtualAirlineMembers: defineTable({
    virtualAirlineId: v.id("virtualAirlines"),
    userId: v.id("users"),
    clerkId: v.string(),
    googleId: v.string(),
    addedBy: v.string(),
  })
    .index("by_virtualAirlineId", ["virtualAirlineId"])
    .index("by_virtualAirlineId_userId", ["virtualAirlineId", "userId"])
    .index("by_userId", ["userId"])
    .index("by_googleId", ["googleId"]),

  // Airport charts (SIDs, STARs, approaches, taxi)
  airportCharts: defineTable({
    icao: v.string(),
    chartType: v.union(
      v.literal("TAXI"),
      v.literal("SID"),
      v.literal("STAR"),
      v.literal("APPROACH"),
    ),
    chartName: v.string(),
    chartUrl: v.string(),
    imageKey: v.optional(v.string()), // UploadThing key for deletion
    source: v.literal("COMMUNITY"),
    isApproved: v.boolean(),
    uploadedBy: v.optional(v.string()), // Clerk user ID
    discordUsername: v.optional(v.string()),
    approvedBy: v.optional(v.string()), // Clerk user ID
    approvedAt: v.optional(v.number()), // timestamp
  })
    .index("by_icao", ["icao"])
    .index("by_icao_type", ["icao", "chartType"])
    .index("by_icao_type_approved", ["icao", "chartType", "isApproved"])
    .index("by_isApproved", ["isApproved"])
    .index("by_uploadedBy", ["uploadedBy"]),

  // Track contributor reward winners (first to 100 uploads)
  // Track which flights users are currently watching
  activeTrackers: defineTable({
    clerkId: v.string(),
    callsign: v.string(),
    lastSeen: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_callsign", ["callsign"])
    .index("by_lastSeen", ["lastSeen"]),

  acarsDevices: defineTable({
    googleId: v.string(),
    tokenHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_googleId", ["googleId"]),

  acarsRegistrationRates: defineTable({
    ipHash: v.string(),
    windowStartedAt: v.number(),
    attempts: v.number(),
  })
    .index("by_ipHash", ["ipHash"])
    .index("by_windowStartedAt", ["windowStartedAt"]),

  acarsPostingReservations: defineTable({
    googleId: v.string(),
    reservedAt: v.number(),
  }).index("by_googleId", ["googleId"]),

  acarsMessages: defineTable({
    userId: v.optional(v.id("users")),
    googleId: v.string(),
    deviceHash: v.string(),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_googleId_createdAt", ["googleId", "createdAt"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  acarsModerationEvents: defineTable({
    userId: v.optional(v.id("users")),
    googleId: v.string(),
    body: v.string(),
    categories: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_googleId_createdAt", ["googleId", "createdAt"]),

  acarsReports: defineTable({
    messageId: v.id("acarsMessages"),
    reporterUserId: v.id("users"),
    pilotUserId: v.optional(v.id("users")),
    googleId: v.string(),
    body: v.string(),
    reason: v.string(),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_message_reporter", ["messageId", "reporterUserId"])
    .index("by_reporter_createdAt", ["reporterUserId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  waypointReminders: defineTable({
    userId: v.id("users"),
    googleId: v.string(),
    discordUsername: v.string(),
    discordUserId: v.string(),
    callsign: v.string(),
    waypointIdent: v.string(),
    intervalSeconds: v.number(),
    durationSeconds: v.number(),
    status: v.union(
      v.literal("armed"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
    triggeredAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    lastSentAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_userId", ["userId"])
    .index("by_googleId_status", ["googleId", "status"])
    .index("by_createdAt", ["createdAt"]),

  challenges: defineTable({
    title: v.string(),
    description: v.string(),
    cadence: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("custom"),
    ),
    mode: v.union(v.literal("auto"), v.literal("manual")),
    ruleType: v.union(
      v.literal("visit_airport"),
      v.literal("visit_airport_count"),
      v.literal("visit_airport_list"),
      v.literal("depart_airport"),
      v.literal("arrive_airport"),
      v.literal("route"),
      v.literal("aircraft_type"),
      v.literal("flight_count"),
      v.literal("min_duration"),
      v.literal("min_distance"),
      v.literal("max_duration"),
      v.literal("max_distance"),
      v.literal("aircraft_category"),
      v.literal("manual"),
    ),
    targetAirport: v.optional(v.string()),
    targetAirports: v.optional(v.array(v.string())),
    targetDepartureAirport: v.optional(v.string()),
    targetArrivalAirport: v.optional(v.string()),
    targetAircraftType: v.optional(v.string()),
    targetAircraftCategories: v.optional(
      v.array(
        v.union(
          v.literal("airbus"),
          v.literal("boeing"),
          v.literal("commercial"),
          v.literal("military"),
          v.literal("helicopter"),
          v.literal("turboprop"),
          v.literal("general_aviation"),
        ),
      ),
    ),
    requiredAirportCount: v.optional(v.number()),
    requiredFlightCount: v.optional(v.number()),
    minDurationMinutes: v.optional(v.number()),
    minDistanceNm: v.optional(v.number()),
    maxDurationMinutes: v.optional(v.number()),
    maxDistanceNm: v.optional(v.number()),
    rules: v.optional(
      v.array(
        v.object({
          ruleType: v.union(
            v.literal("visit_airport"),
            v.literal("visit_airport_count"),
            v.literal("visit_airport_list"),
            v.literal("depart_airport"),
            v.literal("arrive_airport"),
            v.literal("route"),
            v.literal("aircraft_type"),
            v.literal("flight_count"),
            v.literal("min_duration"),
            v.literal("min_distance"),
            v.literal("max_duration"),
            v.literal("max_distance"),
            v.literal("aircraft_category"),
            v.literal("manual"),
          ),
          scope: v.optional(
            v.union(v.literal("challenge"), v.literal("each_flight")),
          ),
          targetAirport: v.optional(v.string()),
          targetAirports: v.optional(v.array(v.string())),
          targetDepartureAirport: v.optional(v.string()),
          targetArrivalAirport: v.optional(v.string()),
          targetAircraftType: v.optional(v.string()),
          targetAircraftCategories: v.optional(
            v.array(
              v.union(
                v.literal("airbus"),
                v.literal("boeing"),
                v.literal("commercial"),
                v.literal("military"),
                v.literal("helicopter"),
                v.literal("turboprop"),
                v.literal("general_aviation"),
              ),
            ),
          ),
          requiredAirportCount: v.optional(v.number()),
          requiredFlightCount: v.optional(v.number()),
          minDurationMinutes: v.optional(v.number()),
          minDistanceNm: v.optional(v.number()),
          maxDurationMinutes: v.optional(v.number()),
          maxDistanceNm: v.optional(v.number()),
        }),
      ),
    ),
    durationDays: v.optional(v.number()),
    startAt: v.number(),
    endAt: v.number(),
    isPublished: v.boolean(),
    createdBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_isPublished", ["isPublished"])
    .index("by_startAt", ["startAt"])
    .index("by_endAt", ["endAt"])
    .index("by_createdBy", ["createdBy"]),

  challengeCompletions: defineTable({
    challengeId: v.id("challenges"),
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("rejected"),
    ),
    completedAt: v.optional(v.number()),
    flightId: v.optional(v.id("flights")),
    flightIds: v.optional(v.array(v.id("flights"))),
    submissionNote: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_challengeId_userId", ["challengeId", "userId"])
    .index("by_challengeId_status", ["challengeId", "status"])
    .index("by_userId_status", ["userId", "status"]),

  challengeLeaderboardEntries: defineTable({
    challengeId: v.id("challenges"),
    userId: v.id("users"),
    progressCurrent: v.number(),
    progressTarget: v.number(),
    progressLabel: v.string(),
    isComplete: v.boolean(),
    status: v.union(v.literal("completed"), v.literal("in_progress")),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_userId", ["userId"])
    .index("by_challengeId_userId", ["challengeId", "userId"]),
});
