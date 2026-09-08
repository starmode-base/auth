import { afterEach, expect, test, vi } from "vitest";
import { makeOpaqueSession } from "./make-opaque-session";
import type { SessionRecord, SessionStorage } from "./opaque-session-contracts";

function makeStorage() {
  const records = new Map<string, SessionRecord>();
  const storage: SessionStorage = {
    get: async (token) => records.get(token) ?? null,
    store: async (record) => {
      records.set(record.sessionId, record);
    },
    delete: async (token) => {
      records.delete(token);
    },
  };
  return { records, storage };
}

afterEach(() => vi.useRealTimers());

test("establish persists the supplied user with the issued credential and configured deadline", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
  const { storage, records } = makeStorage();
  const session = makeOpaqueSession({ storage, ttl: 60_000 });

  const credential = await session.kernel.establish("owner");

  expect(credential.expiresAt).toStrictEqual(new Date(Date.now() + 60_000));
  expect(records.get(credential.token)).toStrictEqual({
    sessionId: credential.token,
    userId: "owner",
    expiresAt: credential.expiresAt,
  });
});

test("resolve reads an established session without extending its absolute lifetime", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
  const { storage, records } = makeStorage();
  const session = makeOpaqueSession({ storage, ttl: 60_000 });
  const credential = await session.kernel.establish("owner");
  const deadline = credential.expiresAt.getTime();

  vi.setSystemTime(deadline - 1);
  expect(await session.kernel.resolve(credential.token)).toStrictEqual({
    userId: "owner",
  });
  vi.setSystemTime(deadline + 1);
  expect(await session.kernel.resolve(credential.token)).toBeNull();
  expect(records.get(credential.token)?.expiresAt.getTime()).toBe(deadline);
});

test("end revokes only the presented session", async () => {
  const { storage } = makeStorage();
  const session = makeOpaqueSession({ storage, ttl: 60_000 });
  const first = await session.kernel.establish("owner");
  const second = await session.kernel.establish("owner");

  await session.capabilities.end(first.token);

  expect(await session.kernel.resolve(first.token)).toBeNull();
  expect(await session.kernel.resolve(second.token)).toStrictEqual({
    userId: "owner",
  });
});

test.each([null, "unknown"])(
  "end leaves existing sessions valid when presented %s",
  async (token) => {
    const { storage } = makeStorage();
    const session = makeOpaqueSession({ storage, ttl: 60_000 });
    const credential = await session.kernel.establish("owner");

    await session.capabilities.end(token);

    expect(await session.kernel.resolve(credential.token)).toStrictEqual({
      userId: "owner",
    });
  },
);

test("establish propagates storage failures", async () => {
  const { storage } = makeStorage();
  const failure = new Error("Storage unavailable");
  const session = makeOpaqueSession({
    storage: {
      ...storage,
      store: async () => {
        throw failure;
      },
    },
    ttl: 60_000,
  });

  await expect(session.kernel.establish("owner")).rejects.toBe(failure);
});

test("end propagates storage failures", async () => {
  const { storage } = makeStorage();
  const failure = new Error("Storage unavailable");
  const session = makeOpaqueSession({
    storage: {
      ...storage,
      delete: async () => {
        throw failure;
      },
    },
    ttl: 60_000,
  });

  await expect(session.capabilities.end("presented")).rejects.toBe(failure);
});
