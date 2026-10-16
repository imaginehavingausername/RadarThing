import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { clear, list, replaceAll } from "./activeFlightSessions";

const SYSTEM_SECRET = "test-system-secret";

interface ActiveFlightSessionDoc {
  _id: string;
  _creationTime: number;
  userId: string;
  state: "active" | "disconnected";
  originalId: string;
  session: unknown;
  disconnectedAt?: number;
  updatedAt: number;
}

interface LiveHourDoc {
  hourStart: number;
  peak: number;
  sampleSum: number;
  sampleCount: number;
  last: number;
}

type PersistedSession = Omit<
  ActiveFlightSessionDoc,
  "_id" | "_creationTime" | "updatedAt"
>;

function session(
  userId: string,
  state: "active" | "disconnected" = "active",
): PersistedSession {
  return {
    userId,
    state,
    originalId: `aircraft-${userId}`,
    session: { userId, state },
    disconnectedAt: state === "disconnected" ? 123 : undefined,
  };
}

function createMockCtx(initialDocs: ActiveFlightSessionDoc[] = []) {
  let nextId = initialDocs.length + 1;
  const docs = initialDocs.map((doc) => ({ ...doc }));
  const liveHours: (LiveHourDoc & { _id: string })[] = [];

  const db = {
    get(id: string) {
      return Promise.resolve({ _id: id, isDeleted: false });
    },
    query(tableName: string) {
      if (tableName === "telemetryLiveHours") {
        let hourStart: number | null = null;
        return {
          withIndex(_indexName: string, predicate: (q: unknown) => unknown) {
            predicate({
              eq(_field: string, value: number) {
                hourStart = value;
              },
            });
            return this;
          },
          first() {
            return Promise.resolve(
              liveHours.find((hour) => hour.hourStart === hourStart) ?? null,
            );
          },
        };
      }
      assert.equal(tableName, "activeFlightSessions");
      let userIdFilter: string | null = null;

      return {
        withIndex(_indexName: string, predicate?: (q: unknown) => unknown) {
          if (predicate) {
            const result = predicate({
              eq(field: string, value: string) {
                assert.equal(field, "userId");
                return { value };
              },
            });
            userIdFilter = (result as { value: string }).value;
          }
          return this;
        },
        collect() {
          return Promise.resolve(
            userIdFilter
              ? docs.filter((doc) => doc.userId === userIdFilter)
              : [...docs],
          );
        },
        take(limit: number) {
          return Promise.resolve(docs.slice(0, limit));
        },
      };
    },
    insert(
      tableName: string,
      value: Omit<ActiveFlightSessionDoc, "_id" | "_creationTime">,
    ) {
      if (tableName === "telemetryLiveHours") {
        const _id = `hour-${nextId++}`;
        liveHours.push({ _id, ...(value as unknown as LiveHourDoc) });
        return Promise.resolve(_id);
      }
      assert.equal(tableName, "activeFlightSessions");
      const _id = `doc-${nextId++}`;
      docs.push({ _id, _creationTime: Date.now(), ...value });
      return Promise.resolve(_id);
    },
    patch(_id: string, value: Partial<ActiveFlightSessionDoc>) {
      const hour = liveHours.find((candidate) => candidate._id === _id);
      if (hour) {
        Object.assign(hour, value);
        return Promise.resolve();
      }
      const doc = docs.find((candidate) => candidate._id === _id);
      assert.ok(doc);
      Object.assign(doc, value);
      return Promise.resolve();
    },
    delete(_id: string) {
      const index = docs.findIndex((candidate) => candidate._id === _id);
      assert.notEqual(index, -1);
      docs.splice(index, 1);
      return Promise.resolve();
    },
  };

  return {
    ctx: { db },
    docs,
    liveHours,
  };
}

async function callHandler<T>(
  fn: { _handler: (ctx: unknown, args: unknown) => Promise<T> },
  ctx: unknown,
  args: Record<string, unknown>,
) {
  return await fn._handler(ctx, {
    ...args,
    systemSecret: SYSTEM_SECRET,
  });
}

beforeEach(() => {
  process.env.CONVEX_SYSTEM_SECRET = SYSTEM_SECRET;
});

test("list returns a bounded active session set", async () => {
  const { ctx } = createMockCtx([
    { _id: "doc-1", _creationTime: 1, updatedAt: 1, ...session("user-1") },
    { _id: "doc-2", _creationTime: 2, updatedAt: 2, ...session("user-2") },
  ]);

  const result = await callHandler<ActiveFlightSessionDoc[]>(
    list as never,
    ctx,
    {
      limit: 1,
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.userId, "user-1");
});

test("replaceAll patches existing sessions, inserts new sessions, and deletes missing users", async () => {
  const { ctx, docs } = createMockCtx([
    { _id: "doc-1", _creationTime: 1, updatedAt: 1, ...session("user-1") },
    { _id: "doc-2", _creationTime: 2, updatedAt: 2, ...session("user-3") },
  ]);

  const result = await callHandler(replaceAll as never, ctx, {
    sessions: [session("user-1", "disconnected"), session("user-2")],
  });

  assert.deepEqual(result, { saved: 2, deleted: 1 });
  assert.deepEqual(docs.map((doc) => [doc.userId, doc.state]).sort(), [
    ["user-1", "disconnected"],
    ["user-2", "active"],
  ]);
});

test("replaceAll records live flight samples into the current hour bucket", async () => {
  const { ctx, liveHours } = createMockCtx();

  await callHandler(replaceAll as never, ctx, {
    sessions: [session("user-1"), session("user-2"), session("user-3")],
  });
  await callHandler(replaceAll as never, ctx, {
    sessions: [session("user-1"), session("user-2", "disconnected")],
  });

  assert.equal(liveHours.length, 1);
  assert.equal(liveHours[0]?.peak, 3);
  assert.equal(liveHours[0]?.last, 1);
  assert.equal(liveHours[0]?.sampleSum, 4);
  assert.equal(liveHours[0]?.sampleCount, 2);
});

test("replaceAll processes duplicate incoming userIds once", async () => {
  const { ctx, docs } = createMockCtx();

  const result = await callHandler(replaceAll as never, ctx, {
    sessions: [session("user-1"), session("user-1", "disconnected")],
  });

  assert.deepEqual(result, { saved: 1, deleted: 0 });
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.state, "disconnected");
});

test("replaceAll with an empty sessions array clears all active session rows", async () => {
  const { ctx, docs } = createMockCtx([
    { _id: "doc-1", _creationTime: 1, updatedAt: 1, ...session("user-1") },
    { _id: "doc-2", _creationTime: 2, updatedAt: 2, ...session("user-2") },
  ]);

  const result = await callHandler(replaceAll as never, ctx, { sessions: [] });

  assert.deepEqual(result, { saved: 0, deleted: 2 });
  assert.deepEqual(docs, []);
});

test("clear deletes only targeted userIds when provided", async () => {
  const { ctx, docs } = createMockCtx([
    { _id: "doc-1", _creationTime: 1, updatedAt: 1, ...session("user-1") },
    { _id: "doc-2", _creationTime: 2, updatedAt: 2, ...session("user-2") },
    { _id: "doc-3", _creationTime: 3, updatedAt: 3, ...session("user-3") },
  ]);

  const result = await callHandler(clear as never, ctx, {
    userIds: ["user-1", "user-3", "user-3"],
  });

  assert.deepEqual(result, { deleted: 2 });
  assert.deepEqual(
    docs.map((doc) => doc.userId),
    ["user-2"],
  );
});
