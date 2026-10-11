/* eslint-disable @typescript-eslint/require-await -- Async fakes match the Convex and fetch interfaces. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  issue,
  revoke,
  history,
  acknowledge,
  myStatus,
  emailResult,
  searchTargets,
  sidebarTarget,
  targetHistory,
} from "./moderation";
import { send } from "./moderationEmail";
import { getRecent } from "./adminTelemetry";
import { requireAdmin, requireAuthenticatedClerkId } from "./lib/auth";
import { SUPER_ADMIN_GOOGLE_ID } from "./lib/moderationRules";
import { storeUser, update, updateByClerkId } from "./users";
import { create as createFlight } from "./flights";
import { heartbeat, startTracking, stopTracking } from "./activeTrackers";
import { replaceAll } from "./activeFlightSessions";
import { hasEffectiveProAccess } from "../src/lib/proAccess";

// Handler tests use an in-memory database; no live users or email providers.
function fixture(actor = "admin") {
  const tables: Record<string, any[]> = {
    users: [
      {
        _id: "admin",
        clerkId: "admin",
        role: "ADMIN",
        email: "admin@example.com",
        isDeleted: false,
      },
      {
        _id: "other",
        clerkId: "other",
        role: "ADMIN",
        email: "other@example.com",
        isDeleted: false,
      },
      {
        _id: "super",
        clerkId: "super",
        role: "FREE",
        googleId: SUPER_ADMIN_GOOGLE_ID,
        email: "super@example.com",
        isDeleted: false,
      },
      {
        _id: "pilot",
        clerkId: "pilot",
        role: "PRO",
        email: "pilot@example.com",
        isDeleted: false,
      },
    ],
    moderationActions: [],
    adminTelemetry: [],
    activeTrackers: [],
    activeFlightSessions: [],
  };
  let sequence = 0;
  const scheduled: any[] = [];
  const ctx: any = {
    auth: { getUserIdentity: async () => (actor ? { subject: actor } : null) },
    scheduler: {
      runAfter: async (...args: any[]) => {
        scheduled.push(args);
      },
    },
    db: {
      normalizeId: (_table: string, id: string) => id,
      get: async (id: string) =>
        Object.values(tables)
          .flat()
          .find((row) => row._id === id) ?? null,
      insert: async (table: string, value: any) => {
        const _id = `record-${++sequence}`;
        (tables[table] ??= []).push({ ...value, _id });
        return _id;
      },
      patch: async (id: string, patch: any) => {
        const row = await ctx.db.get(id);
        assert.ok(row);
        Object.assign(row, patch);
      },
      delete: async (id: string) => {
        for (const rows of Object.values(tables)) {
          const i = rows.findIndex((row) => row._id === id);
          if (i >= 0) rows.splice(i, 1);
        }
      },
      query: (table: string) => {
        let rows = [...(tables[table] ?? [])];
        const q: any = {
          withIndex: (_name: string, predicate?: (q: any) => any) => {
            const index: any = {
              eq: (key: string, value: any) => {
                rows = rows.filter((r) => r[key] === value);
                return index;
              },
            };
            predicate?.(index);
            return q;
          },
          order: (direction: string) => {
            rows.sort(
              (a, b) =>
                (a.createdAt - b.createdAt) * (direction === "desc" ? -1 : 1),
            );
            return q;
          },
          first: async () => rows[0] ?? null,
          take: async (n: number) => rows.slice(0, n),
          collect: async () => rows,
          paginate: async ({ numItems }: { numItems: number }) => ({
            page: rows.slice(0, numItems),
            isDone: rows.length <= numItems,
            continueCursor: "",
          }),
        };
        return q;
      },
    },
  };
  return {
    ctx,
    tables,
    scheduled,
    as: (next: string) => {
      actor = next;
    },
  };
}
async function call(fn: unknown, ctx: any, args: any = {}): Promise<any> {
  return await (
    fn as { _handler: (ctx: any, args: any) => Promise<any> }
  )._handler(ctx, args);
}
const warning = {
  targetUserId: "pilot",
  kind: "warn",
  reason: "Rule broken",
  requestId: "request-1",
};

test("warning records actor, target, reason, timestamp and audit; queues one email", async () => {
  const f = fixture();
  const id = await call(issue, f.ctx, warning);
  const record = await f.ctx.db.get(id);
  assert.equal(record.actorUserId, "admin");
  assert.equal(record.targetEmail, "pilot@example.com");
  assert.equal(record.reason, warning.reason);
  assert.ok(record.createdAt > 0);
  assert.equal(f.tables.adminTelemetry?.[0].action, "warn");
  assert.equal(f.scheduled.length, 1);
  assert.equal(await call(issue, f.ctx, warning), id);
  assert.equal(f.scheduled.length, 1);
  await assert.rejects(
    call(issue, f.ctx, { ...warning, reason: "Changed" }),
    /already used/,
  );
});

test("permissions reject guests, ordinary users, self, peer admins and super-admin targets", async () => {
  for (const actor of ["", "pilot"]) {
    const f = fixture(actor);
    await assert.rejects(call(issue, f.ctx, warning), /Unauthorized/);
  }
  const f = fixture();
  for (const targetUserId of ["admin", "other", "super", "missing"])
    await assert.rejects(call(issue, f.ctx, { ...warning, targetUserId }));
  await assert.rejects(
    call(issue, f.ctx, { ...warning, reason: "   " }),
    /reason/,
  );
  await assert.rejects(
    call(issue, f.ctx, { ...warning, reason: "x".repeat(2001) }),
    /reason/,
  );
  assert.equal(f.tables.moderationActions?.length, 0);
});

test("ban removes tracking, rejects duplicate bans and enforces backend restrictions", async () => {
  const f = fixture();
  assert.ok(f.tables.activeTrackers);
  assert.ok(f.tables.activeFlightSessions);
  f.tables.activeTrackers.push({ _id: "tracker", clerkId: "pilot" });
  f.tables.activeFlightSessions.push({ _id: "session", userId: "pilot" });
  const id = await call(issue, f.ctx, { ...warning, kind: "ban" });
  assert.equal((await f.ctx.db.get("pilot")).activeBanId, id);
  assert.equal(f.tables.activeTrackers?.length, 0);
  assert.equal(f.tables.activeFlightSessions?.length, 0);
  await assert.rejects(
    call(issue, f.ctx, { ...warning, kind: "ban", requestId: "duplicate" }),
    /already banned/,
  );
  f.as("pilot");
  await assert.rejects(requireAuthenticatedClerkId(f.ctx), /restricted/);
  await assert.rejects(
    call(startTracking, f.ctx, { clerkId: "pilot", callsigns: ["TEST"] }),
    /restricted/,
  );
  await assert.rejects(
    call(startTracking, f.ctx, {
      clerkId: "anon:123e4567-e89b-42d3-a456-426614174000",
      callsigns: ["TEST"],
    }),
    /restricted/,
  );
  process.env.CONVEX_SYSTEM_SECRET = "test-secret";
  await assert.rejects(
    call(createFlight, f.ctx, { userId: "pilot", systemSecret: "test-secret" }),
    /restricted/,
  );
  assert.equal(hasEffectiveProAccess(await f.ctx.db.get("pilot")), false);
  const persisted = await call(replaceAll, f.ctx, {
    sessions: [{ userId: "pilot" }],
    systemSecret: "test-secret",
  });
  assert.equal(persisted.saved, 0);
});

test("anonymous trackers can start, heartbeat, and stop without Clerk auth", async () => {
  const f = fixture("");
  const clerkId = "anon:123e4567-e89b-42d3-a456-426614174000";
  await call(startTracking, f.ctx, { clerkId, callsigns: ["TEST"] });
  assert.equal(f.tables.activeTrackers?.length, 1);
  assert.equal(f.tables.activeTrackers?.[0]?.clerkId, clerkId);
  f.tables.activeTrackers[0]!.lastSeen = 0;
  await call(heartbeat, f.ctx, { clerkId });
  assert.ok(f.tables.activeTrackers?.[0]?.lastSeen > 0);
  await call(stopTracking, f.ctx, { clerkId });
  assert.equal(f.tables.activeTrackers?.length, 0);

  await assert.rejects(
    call(startTracking, f.ctx, { clerkId: "pilot", callsigns: ["TEST"] }),
    /Unauthorized/,
  );
  await assert.rejects(
    call(startTracking, f.ctx, { clerkId: "anon:guess", callsigns: ["TEST"] }),
    /Unauthorized/,
  );
  f.as("admin");
  await assert.rejects(
    call(startTracking, f.ctx, { clerkId: "pilot", callsigns: ["TEST"] }),
    /Unauthorized/,
  );
});

test("only super-admin can reverse actions; original history and audit remain", async () => {
  const f = fixture();
  const id = await call(issue, f.ctx, { ...warning, kind: "ban" });
  for (const actor of ["admin", "other", "pilot", ""]) {
    f.as(actor);
    await assert.rejects(
      call(revoke, f.ctx, { id, reason: "Appeal accepted" }),
    );
  }
  f.as("super");
  await call(revoke, f.ctx, { id, reason: "Appeal accepted" });
  assert.equal((await f.ctx.db.get("pilot")).activeBanId, undefined);
  const original = await f.ctx.db.get(id);
  assert.equal(original.reason, warning.reason);
  assert.equal(original.actorUserId, "admin");
  assert.equal(original.revokedBy, "super");
  assert.equal(f.tables.adminTelemetry?.[1].action, "lift_ban");
  await assert.rejects(call(revoke, f.ctx, { id, reason: "Again" }), /already/);
});

test("super-admin can ban an admin; banned admins lose admin permissions", async () => {
  const f = fixture("super");
  await call(issue, f.ctx, { ...warning, kind: "ban", targetUserId: "admin" });
  f.as("admin");
  await assert.rejects(requireAdmin(f.ctx), /Unauthorized/);
});

test("admin histories are scoped; super-admin sees all, including former admins", async () => {
  const f = fixture();
  await call(issue, f.ctx, warning);
  f.as("other");
  await call(issue, f.ctx, { ...warning, requestId: "other" });
  const args = { paginationOpts: { numItems: 25, cursor: null } };
  assert.equal((await call(history, f.ctx, args)).page.length, 1);
  f.as("super");
  assert.equal((await call(history, f.ctx, args)).page.length, 2);
  await f.ctx.db.patch("admin", { role: "FREE", isDeleted: true });
  assert.equal((await call(getRecent, f.ctx)).length, 2);
});

test("warnings persist until owner acknowledgment; revocation removes pending notice", async () => {
  const f = fixture();
  const id = await call(issue, f.ctx, warning);
  await assert.rejects(call(acknowledge, f.ctx, { id }), /Unauthorized/);
  f.as("pilot");
  assert.equal((await call(myStatus, f.ctx)).warnings.length, 1);
  await call(acknowledge, f.ctx, { id });
  await call(acknowledge, f.ctx, { id });
  assert.equal((await call(myStatus, f.ctx)).warnings.length, 0);
  f.as("admin");
  const next = await call(issue, f.ctx, { ...warning, requestId: "next" });
  f.as("super");
  await call(revoke, f.ctx, { id: next, reason: "Mistake" });
  f.as("pilot");
  assert.equal((await call(myStatus, f.ctx)).warnings.length, 0);
});

test("email retries are bounded and successful sends cannot be reverted", async () => {
  const f = fixture();
  const id = await call(issue, f.ctx, warning);
  for (let i = 0; i < 6; i++)
    await call(emailResult, f.ctx, { id, sent: false, error: "HTTP 503" });
  assert.equal((await f.ctx.db.get(id)).emailStatus, "failed");
  assert.equal(f.scheduled.length, 6);
  const second = await call(issue, f.ctx, { ...warning, requestId: "second" });
  await call(emailResult, f.ctx, { id: second, sent: true });
  await call(emailResult, f.ctx, { id: second, sent: false });
  assert.equal((await f.ctx.db.get(second)).emailStatus, "sent");
});

test("email action uses stable idempotency keys and reports provider errors", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "fake-test-key";
  const f = fixture();
  const id = await call(issue, f.ctx, warning);
  const record = await f.ctx.db.get(id);
  const results: any[] = [];
  let attempts = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      attempts++;
      assert.equal(
        (init?.headers as Record<string, string>)["Idempotency-Key"],
        `moderation/${id}`,
      );
      assert.equal(typeof init?.body, "string");
      const body = JSON.parse(init?.body as string);
      assert.deepEqual(body.to, ["pilot@example.com"]);
      assert.match(body.text, /Rule broken/);
      return new Response("{}", { status: attempts === 1 ? 503 : 200 });
    };
    const ctx = {
      runQuery: async () => record,
      runMutation: async (_fn: unknown, args: any) => {
        results.push(args);
      },
    };
    await call(send, ctx, { id });
    await call(send, ctx, { id });
    assert.equal(results[0].sent, false);
    assert.equal(results[1].sent, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});

test("browser cannot forge the Google ID or email used for super-admin authorization", async () => {
  const f = fixture("pilot");
  await assert.rejects(
    call(storeUser, f.ctx, { googleId: SUPER_ADMIN_GOOGLE_ID }),
    /Unauthorized/,
  );
  await assert.rejects(
    call(update, f.ctx, { id: "pilot", googleId: SUPER_ADMIN_GOOGLE_ID }),
    /Unauthorized/,
  );
  await assert.rejects(
    call(updateByClerkId, f.ctx, {
      clerkId: "pilot",
      email: "super@example.com",
    }),
    /Unauthorized/,
  );
});

test("history clears safely when an admin loses access", async () => {
  const f = fixture();
  await call(issue, f.ctx, warning);
  await f.ctx.db.patch("admin", { activeBanId: "ban" });
  const result = await call(history, f.ctx, {
    paginationOpts: { numItems: 25, cursor: null },
  });
  assert.deepEqual(result.page, []);
  assert.equal(result.isDone, true);
  f.as("pilot");
  assert.deepEqual(
    (
      await call(history, f.ctx, {
        paginationOpts: { numItems: 25, cursor: null },
      })
    ).page,
    [],
  );
});

test("subscription updates cannot clear a ban", async () => {
  const f = fixture();
  const id = await call(issue, f.ctx, { ...warning, kind: "ban" });
  process.env.CONVEX_SYSTEM_SECRET = "test-secret";
  await call(updateByClerkId, f.ctx, {
    clerkId: "pilot",
    role: "PRO",
    systemSecret: "test-secret",
  });
  assert.equal((await f.ctx.db.get("pilot")).activeBanId, id);
  assert.equal(hasEffectiveProAccess(await f.ctx.db.get("pilot")), false);
});

test("moderation search accepts only Discord usernames and RT IDs and returns no private account fields", async () => {
  const f = fixture();
  await f.ctx.db.patch("pilot", {
    discordUsername: "SkyPilot",
    googleId: "123456789",
    clerkId: "clerk_private_pilot",
  });
  for (const search of ["skypilot", "@SKYPILOT", "pilot"]) {
    const matches = await call(searchTargets, f.ctx, { search });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].label, "SkyPilot");
    assert.deepEqual(
      Object.keys(matches[0]).sort(),
      ["_id", "discordUsername", "label", "isBanned", "disabledReason"].sort(),
    );
  }
  for (const search of [
    "pilot@example.com",
    "123456789",
    "clerk_private_pilot",
    "   ",
  ]) {
    assert.deepEqual(await call(searchTargets, f.ctx, { search }), []);
  }
  const sidebar = await call(sidebarTarget, f.ctx, { googleId: "123456789" });
  assert.equal(sidebar.label, "SkyPilot");
  assert.equal("email" in sidebar, false);
  assert.equal("googleId" in sidebar, false);
  await f.ctx.db.patch("pilot", { discordUsername: undefined });
  assert.equal(
    (await call(searchTargets, f.ctx, { search: "pilot" }))[0].label,
    "RT ID: pilot",
  );
  f.as("pilot");
  await assert.rejects(
    call(searchTargets, f.ctx, { search: "pilot" }),
    /Unauthorized/,
  );
});

test("history, sidebar history, and moderation logs redact legacy email identities", async () => {
  const f = fixture();
  const id = await call(issue, f.ctx, warning);
  await f.ctx.db.patch(id, {
    targetLabel: "pilot@example.com",
    actorLabel: "admin@example.com",
    emailLastError: "Failed for pilot@example.com",
  });
  const args = { paginationOpts: { numItems: 25, cursor: null } };
  for (const records of [
    await call(history, f.ctx, args),
    await call(targetHistory, f.ctx, { ...args, targetUserId: "pilot" }),
  ]) {
    assert.equal(records.page[0].targetLabel, "RT ID: pilot");
    assert.equal(records.page[0].actorLabel, "RT ID: admin");
    assert.equal("targetEmail" in records.page[0], false);
    assert.equal("requestId" in records.page[0], false);
    assert.doesNotMatch(JSON.stringify(records), /@example\.com/);
  }
  // Keep the email available to the internal notification worker.
  assert.equal((await f.ctx.db.get(id)).targetEmail, "pilot@example.com");
  f.as("super");
  await call(revoke, f.ctx, { id, reason: "Mistake" });
  await f.ctx.db.patch(id, { revokedByLabel: "super@example.com" });
  assert.doesNotMatch(
    JSON.stringify(await call(history, f.ctx, args)),
    /@example\.com/,
  );
  const event = f.tables.adminTelemetry?.[0];
  event.actorEmail = "admin@example.com";
  event.targetEmail = "pilot@example.com";
  event.resourceLabel = "pilot@example.com";
  event.metadata = {
    reason: "Rule broken",
    originalActor: "admin@example.com",
  };
  const logs = await call(getRecent, f.ctx);
  assert.doesNotMatch(JSON.stringify(logs), /@example\.com/);
  assert.equal(
    logs.find((event: { action: string }) => event.action === "warn")
      .actorLabel,
    "RT ID: admin",
  );
});
