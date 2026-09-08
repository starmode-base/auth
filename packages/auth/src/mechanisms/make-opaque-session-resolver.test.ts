import { afterEach, expect, test, vi } from "vitest";
import type { SessionRecord } from "./opaque-session-contracts";
import { makeOpaqueSessionResolver } from "./make-opaque-session-resolver";

afterEach(() => vi.useRealTimers());

test("resolve returns null for an absent presented token", async () => {
  const resolver = makeOpaqueSessionResolver({
    storage: {
      get: async () => {
        throw new Error("No session was presented");
      },
    },
  });

  expect(await resolver.resolve(null)).toBeNull();
});

test("resolve returns null for an unknown session", async () => {
  const resolver = makeOpaqueSessionResolver({
    storage: { get: async () => null },
  });

  expect(await resolver.resolve("unknown")).toBeNull();
});

test.each([
  { offset: -1, identity: null, description: "expired" },
  { offset: 0, identity: { userId: "owner" }, description: "at its deadline" },
  {
    offset: 1,
    identity: { userId: "owner" },
    description: "before its deadline",
  },
])(
  "resolve accepts a session only through its deadline ($description)",
  async ({ offset, identity }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    const record: SessionRecord = {
      sessionId: "presented",
      userId: "owner",
      expiresAt: new Date(Date.now() + offset),
    };
    const resolver = makeOpaqueSessionResolver({
      storage: {
        get: async (token) => (token === record.sessionId ? record : null),
      },
    });

    expect(await resolver.resolve("presented")).toStrictEqual(identity);
  },
);

test("resolve reads current storage on every invocation", async () => {
  const records = new Map<string, SessionRecord>([
    [
      "presented",
      {
        sessionId: "presented",
        userId: "owner",
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
  ]);
  const resolver = makeOpaqueSessionResolver({
    storage: { get: async (token) => records.get(token) ?? null },
  });

  expect(await resolver.resolve("presented")).toStrictEqual({
    userId: "owner",
  });
  records.delete("presented");
  expect(await resolver.resolve("presented")).toBeNull();
});

test("resolve propagates storage failures", async () => {
  const failure = new Error("Storage unavailable");
  const resolver = makeOpaqueSessionResolver({
    storage: {
      get: async () => {
        throw failure;
      },
    },
  });

  await expect(resolver.resolve("presented")).rejects.toBe(failure);
});
