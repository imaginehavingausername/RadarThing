/* eslint-disable @typescript-eslint/require-await -- Async fixtures match Convex's database interface. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  registerDevice,
  isDeviceRegistered,
  publish,
  listPublic,
  listForDevice,
  postingStatus,
  remove,
  report,
  adminReports,
  adminBlocked,
  adminRemove,
  adminReleaseDevice,
  recordBlocked,
  exportMessages,
  exportBlocked,
  exportReports,
  reservePosting,
  reserveRegistration,
  cleanupRegistrationRates,
  setFlightSession,
} from "./acars";

const googleId = "123456789012345678";
const tokenHash = "a".repeat(64);
const systemSecret = "test-acars-secret";
const sessionId = "11111111-1111-4111-8111-111111111111";
const nextSessionId = "22222222-2222-4222-8222-222222222222";

function fixture() {
  process.env.CONVEX_SYSTEM_SECRET = systemSecret;
  const tables: Record<string, any[]> & {
    acarsDevices: any[];
    acarsMessages: any[];
    acarsFlightSessions: any[];
    acarsModerationEvents: any[];
    acarsReports: any[];
    acarsRegistrationRates: any[];
  } = {
    users: [
      {
        _id: "pilot",
        clerkId: "pilot",
        googleId,
        role: "FREE",
        isDeleted: false,
      },
      { _id: "viewer", clerkId: "viewer", role: "FREE", isDeleted: false },
      { _id: "admin", clerkId: "admin", role: "ADMIN", isDeleted: false },
    ],
    acarsDevices: [],
    acarsMessages: [],
    acarsFlightSessions: [
      { _id: "flight-session", googleId, sessionId, active: true },
    ],
    acarsModerationEvents: [],
    acarsReports: [],
    acarsRegistrationRates: [],
    acarsPostingReservations: [],
  };
  let sequence = 0;
  let actor = "viewer";
  const ctx: any = {
    auth: { getUserIdentity: async () => ({ subject: actor }) },
    db: {
      get: async (id: string) =>
        Object.values(tables)
          .flat()
          .find((row) => row._id === id) ?? null,
      insert: async (table: string, value: any) => {
        const id = `record-${++sequence}`;
        (tables[table] ??= []).push({ ...value, _id: id });
        return id;
      },
      delete: async (id: string) => {
        for (const rows of Object.values(tables)) {
          const index = rows.findIndex((row) => row._id === id);
          if (index >= 0) rows.splice(index, 1);
        }
      },
      patch: async (id: string, value: any) => {
        const row = await ctx.db.get(id);
        assert.ok(row);
        Object.assign(row, value);
      },
      query: (table: string) => {
        let rows = [...(tables[table] ?? [])];
        const q: any = {
          withIndex: (_name: string, predicate?: (index: any) => unknown) => {
            const index: any = {
              eq: (field: string, value: unknown) => {
                rows = rows.filter((row) => row[field] === value);
                return index;
              },
              lt: (field: string, value: number) => {
                rows = rows.filter((row) => row[field] < value);
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
          take: async (count: number) => rows.slice(0, count),
          collect: async () => rows,
          paginate: async ({
            numItems,
            cursor,
          }: {
            numItems: number;
            cursor: string | null;
          }) => {
            const start = cursor ? Number(cursor) : 0;
            const page = rows.slice(start, start + numItems);
            const end = start + page.length;
            return {
              page,
              isDone: end >= rows.length,
              continueCursor: String(end),
            };
          },
        };
        return q;
      },
    },
  };
  return {
    ctx,
    tables,
    as: (name: string) => {
      actor = name;
    },
  };
}

async function call<T>(fn: unknown, ctx: any, args: any): Promise<T> {
  return await (
    fn as { _handler: (context: any, values: any) => Promise<T> }
  )._handler(ctx, args);
}

test("pilot entries require a registered device and trusted server mutation", async () => {
  const f = fixture();
  await assert.rejects(
    call(publish, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "Route update",
      systemSecret,
    }),
    /not registered/,
  );
  await assert.rejects(
    call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret: "wrong" }),
    /Unauthorized/,
  );
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  await assert.rejects(
    call(publish, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "Route update",
      systemSecret: "wrong",
    }),
    /Unauthorized/,
  );
  const id = await call<string>(publish, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Route update",
    systemSecret,
  });
  assert.equal(
    (await call<any[]>(listPublic, f.ctx, { googleId }))[0].body,
    "Route update",
  );
  assert.equal(
    (await call<any[]>(listForDevice, f.ctx, { googleId, tokenHash }))[0]
      .canRemove,
    true,
  );
  assert.ok(
    (
      await call<{ retryAfter?: number }>(postingStatus, f.ctx, {
        googleId,
        tokenHash,
      })
    ).retryAfter,
  );
  await assert.rejects(
    call(publish, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "Again",
      systemSecret,
    }),
    /Wait 30 seconds/,
  );
  await assert.rejects(
    call(remove, f.ctx, {
      googleId,
      tokenHash: "b".repeat(64),
      messageId: id,
      systemSecret,
    }),
    /not registered/,
  );
  await call(remove, f.ctx, {
    googleId,
    tokenHash,
    messageId: id,
    systemSecret,
  });
  assert.deepEqual(await call(listPublic, f.ctx, { googleId }), []);
});

test("existing account ban blocks ACARS publication and hides entries", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  await call(publish, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Before ban",
    systemSecret,
  });
  const pilot = f.tables.users?.[0];
  assert.ok(pilot);
  pilot.activeBanId = "ban";
  await assert.rejects(
    call(publish, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "After ban",
      systemSecret,
    }),
    /restricted/,
  );
  assert.deepEqual(await call(listPublic, f.ctx, { googleId }), []);
});

test("ACARS entries are visible only in their active flight", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  await call(publish, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "First flight",
    systemSecret,
  });
  await call(setFlightSession, f.ctx, {
    googleId,
    tokenHash,
    sessionId: nextSessionId,
    active: true,
    systemSecret,
  });
  assert.deepEqual(await call(listPublic, f.ctx, { googleId }), []);
  assert.deepEqual(
    await call(listForDevice, f.ctx, { googleId, tokenHash }),
    [],
  );
  assert.deepEqual(
    await call(reservePosting, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      systemSecret,
    }),
    { allowed: false, retryAfter: 0 },
  );
  await assert.rejects(
    call(publish, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "Late first flight",
      systemSecret,
    }),
    /no longer active/,
  );
  await call(setFlightSession, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    active: false,
    systemSecret,
  });
  assert.equal(f.tables.acarsFlightSessions[0].active, true);
  f.tables.acarsMessages[0].createdAt -= 60_000;
  await call(publish, f.ctx, {
    googleId,
    tokenHash,
    sessionId: nextSessionId,
    body: "Second flight",
    systemSecret,
  });
  const current = await call<any[]>(listPublic, f.ctx, { googleId });
  assert.deepEqual(
    current.map((entry) => entry.body),
    ["Second flight"],
  );
  await call(setFlightSession, f.ctx, {
    googleId,
    tokenHash,
    sessionId: nextSessionId,
    active: false,
    systemSecret,
  });
  assert.deepEqual(await call(listPublic, f.ctx, { googleId }), []);
});

test("one device claims a GeoFS ID and the same device can register again", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  await assert.rejects(
    call(isDeviceRegistered, f.ctx, {
      googleId,
      tokenHash,
      systemSecret: "wrong",
    }),
    /Unauthorized/,
  );
  assert.equal(
    await call(isDeviceRegistered, f.ctx, {
      googleId,
      tokenHash,
      systemSecret,
    }),
    true,
  );
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  assert.equal(f.tables.acarsDevices.length, 1);
  await assert.rejects(
    call(registerDevice, f.ctx, {
      googleId,
      tokenHash: "b".repeat(64),
      systemSecret,
    }),
    /already registered/,
  );
});

test("ACARS registration and posting require a linked RT account", async () => {
  const f = fixture();
  const pilot = f.tables.users?.[0];
  assert.ok(pilot);
  delete pilot.googleId;
  await assert.rejects(
    call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret }),
    /Link a RadarThing account/,
  );
  pilot.googleId = googleId;
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  delete pilot.googleId;
  await assert.rejects(
    call(publish, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "Unlinked entry",
      systemSecret,
    }),
    /Link a RadarThing account/,
  );
  assert.equal(f.tables.acarsMessages.length, 0);
});

test("blocked and published attempts share the mutation cooldown", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  await call(recordBlocked, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Blocked sample",
    categories: ["harassment"],
    systemSecret,
  });
  await assert.rejects(
    call(recordBlocked, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "Blocked again",
      categories: ["harassment"],
      systemSecret,
    }),
    /Wait 30 seconds/,
  );
  await assert.rejects(
    call(publish, f.ctx, {
      googleId,
      tokenHash,
      sessionId,
      body: "Publish after block",
      systemSecret,
    }),
    /Wait 30 seconds/,
  );
  assert.equal(f.tables.acarsModerationEvents.length, 1);
  assert.equal(f.tables.acarsMessages.length, 0);
});

test("account export pages include earlier GeoFS entries and filed reports", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  await call(publish, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Linked entry",
    systemSecret,
  });
  f.tables.acarsMessages.push({
    _id: "old-message",
    googleId,
    deviceHash: tokenHash,
    body: "Earlier entry",
    createdAt: Date.now() - 60_000,
  });
  f.tables.acarsModerationEvents.push({
    _id: "old-block",
    googleId,
    body: "Earlier blocked text",
    categories: ["harassment"],
    createdAt: Date.now() - 60_000,
  });
  f.as("pilot");
  const first = await call<any>(exportMessages, f.ctx, {
    source: "google",
    paginationOpts: { numItems: 1, cursor: null },
  });
  const second = await call<any>(exportMessages, f.ctx, {
    source: "google",
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
  });
  assert.equal(first.isDone, false);
  assert.deepEqual(
    [first.page[0].body, second.page[0].body],
    ["Linked entry", "Earlier entry"],
  );
  const blocked = await call<any>(exportBlocked, f.ctx, {
    source: "google",
    paginationOpts: { numItems: 100, cursor: null },
  });
  assert.deepEqual(
    blocked.page.map((row: any) => row.id),
    ["old-block"],
  );
  f.as("viewer");
  await call(report, f.ctx, {
    messageId: f.tables.acarsMessages[0]._id,
    reason: "Concern",
  });
  const reports = await call<any>(exportReports, f.ctx, {
    paginationOpts: { numItems: 100, cursor: null },
  });
  assert.equal(reports.page[0].reason, "Concern");
});

test("reported entries and blocked attempts appear in admin review", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  const id = await call<string>(publish, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Pilot update",
    systemSecret,
  });
  assert.deepEqual(
    await call(report, f.ctx, { messageId: id, reason: "Misleading" }),
    { status: "reported" },
  );
  assert.deepEqual(
    await call(report, f.ctx, { messageId: id, reason: "Duplicate" }),
    { status: "already_reported" },
  );
  assert.equal(f.tables.acarsReports.length, 1);
  f.tables.acarsMessages[0].createdAt -= 60_000;
  await call(recordBlocked, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Blocked sample",
    categories: ["harassment"],
    systemSecret,
  });
  const paginationOpts = { numItems: 25, cursor: null };
  await assert.rejects(
    call(adminReports, f.ctx, { paginationOpts }),
    /Unauthorized/,
  );
  f.as("admin");
  const reports = await call<any>(adminReports, f.ctx, { paginationOpts });
  const blocked = await call<any>(adminBlocked, f.ctx, { paginationOpts });
  assert.equal(reports.page[0].body, "Pilot update");
  assert.equal(reports.page[0].pilotLabel, "RT ID: pilot");
  assert.equal("googleId" in reports.page[0], false);
  assert.equal(blocked.page[0].categories[0], "harassment");
  assert.equal(blocked.page[0].pilotLabel, "RT ID: pilot");
  assert.equal("googleId" in blocked.page[0], false);
  await call(adminRemove, f.ctx, { messageId: id });
  const afterRemoval = await call<any>(adminReports, f.ctx, { paginationOpts });
  assert.equal(afterRemoval.page[0].body, "Pilot update");
  assert.equal(afterRemoval.page[0].isMessagePresent, false);
});

test("own ACARS reports return a user-facing status without creating a report", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  const id = await call<string>(publish, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Pilot update",
    systemSecret,
  });
  f.as("pilot");
  assert.equal(
    (await call<any[]>(listPublic, f.ctx, { googleId }))[0].isOwnEntry,
    true,
  );
  assert.deepEqual(
    await call(report, f.ctx, { messageId: id, reason: "Own report" }),
    { status: "own_entry" },
  );
  assert.equal(f.tables.acarsReports.length, 0);
  f.as("viewer");
  assert.equal(
    (await call<any[]>(listPublic, f.ctx, { googleId }))[0].isOwnEntry,
    false,
  );
  assert.deepEqual(await call(report, f.ctx, { messageId: id, reason: " " }), {
    status: "invalid_reason",
  });
});

test("registration attempts are limited and admins can release claims", async () => {
  const f = fixture();
  const ipHash = "c".repeat(64);
  for (let index = 0; index < 8; index++) {
    assert.equal(
      (await call<any>(reserveRegistration, f.ctx, { ipHash, systemSecret }))
        .allowed,
      true,
    );
  }
  assert.equal(
    (await call<any>(reserveRegistration, f.ctx, { ipHash, systemSecret }))
      .allowed,
    false,
  );
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  await assert.rejects(
    call(adminReleaseDevice, f.ctx, { userId: "pilot" }),
    /Unauthorized/,
  );
  f.as("admin");
  await assert.rejects(
    call(adminReleaseDevice, f.ctx, { userId: "missing" }),
    /User not found/,
  );
  assert.equal(await call(adminReleaseDevice, f.ctx, { userId: "pilot" }), 1);
  assert.equal(f.tables.acarsDevices.length, 0);
});

test("legacy unlinked ACARS review does not identify pilots by GeoFS ID", async () => {
  const f = fixture();
  f.tables.acarsReports.push({
    _id: "legacy-report",
    messageId: "missing-message",
    reporterUserId: "viewer",
    googleId: "876543210987654321",
    body: "Old entry",
    reason: "Concern",
    createdAt: Date.now(),
  });
  f.tables.acarsModerationEvents.push({
    _id: "legacy-block",
    googleId: "876543210987654321",
    body: "Old blocked entry",
    categories: ["harassment"],
    createdAt: Date.now(),
  });
  f.as("admin");
  const paginationOpts = { numItems: 25, cursor: null };
  const reports = await call<any>(adminReports, f.ctx, { paginationOpts });
  const blocked = await call<any>(adminBlocked, f.ctx, { paginationOpts });
  assert.equal(reports.page[0].pilotLabel, "Unlinked pilot");
  assert.equal(reports.page[0].pilotId, null);
  assert.equal(blocked.page[0].pilotLabel, "Unlinked pilot");
  assert.equal(blocked.page[0].userId, null);
});

test("posting reservation stops a second moderation attempt", async () => {
  const f = fixture();
  await call(registerDevice, f.ctx, { googleId, tokenHash, systemSecret });
  const first = await call<any>(reservePosting, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    systemSecret,
  });
  const second = await call<any>(reservePosting, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    systemSecret,
  });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.ok(second.retryAfter > 0);
  await call(recordBlocked, f.ctx, {
    googleId,
    tokenHash,
    sessionId,
    body: "Flagged",
    categories: ["harassment"],
    systemSecret,
  });
  assert.equal(f.tables.acarsModerationEvents.length, 1);
});

test("older reports and previous-ID entries remain reachable after 100 rows", async () => {
  const f = fixture();
  for (let index = 0; index < 120; index++) {
    f.tables.acarsMessages.push({
      _id: `history-${index}`,
      userId: "pilot",
      googleId: index < 20 ? "876543210987654321" : googleId,
      body: `Entry ${index}`,
      createdAt: index,
    });
    f.tables.acarsReports.push({
      _id: `report-${index}`,
      messageId: `history-${index}`,
      reporterUserId: "viewer",
      googleId,
      body: `Report ${index}`,
      reason: "Concern",
      createdAt: index,
      reviewedAt: index === 0 ? undefined : index,
    });
  }
  f.as("pilot");
  const firstExport = await call<any>(exportMessages, f.ctx, {
    source: "user",
    paginationOpts: { numItems: 100, cursor: null },
  });
  const olderExport = await call<any>(exportMessages, f.ctx, {
    source: "user",
    paginationOpts: { numItems: 100, cursor: firstExport.continueCursor },
  });
  assert.equal(firstExport.page.length, 100);
  assert.equal(olderExport.page.length, 20);
  assert.equal(olderExport.page[19].googleId, "876543210987654321");
  f.as("admin");
  const firstReports = await call<any>(adminReports, f.ctx, {
    paginationOpts: { numItems: 100, cursor: null },
  });
  const olderReports = await call<any>(adminReports, f.ctx, {
    paginationOpts: { numItems: 100, cursor: firstReports.continueCursor },
  });
  assert.equal(olderReports.page.length, 20);
  assert.equal(olderReports.page[19].reviewedAt, undefined);
});

test("expired registration rate rows are cleaned up", async () => {
  const f = fixture();
  f.tables.acarsRegistrationRates = [
    {
      _id: "expired",
      ipHash: "a".repeat(64),
      attempts: 8,
      windowStartedAt: Date.now() - 3_600_001,
    },
    {
      _id: "current",
      ipHash: "b".repeat(64),
      attempts: 1,
      windowStartedAt: Date.now(),
    },
  ];
  await call(cleanupRegistrationRates, f.ctx, {});
  assert.deepEqual(
    f.tables.acarsRegistrationRates.map((row) => row._id),
    ["current"],
  );
});
