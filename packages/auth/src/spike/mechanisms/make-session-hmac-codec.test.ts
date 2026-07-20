import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSessionHmacCodec } from "./make-session-hmac-codec";

const MINUTE = 60_000;
const T0 = new Date("2026-07-19T12:00:00Z");

const record = {
  sessionId: "session-1",
  userId: "user-1",
  expiresAt: new Date(T0.getTime() + 60 * MINUTE),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session record", () => {
  it("carries the session record through encode and decode", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: null }),
    );

    expect(decoded?.record).toStrictEqual(record);
  });

  it("round-trips a never-expiring session", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const forever = { ...record, expiresAt: null };
    const decoded = await codec.decode(
      await codec.encode(forever, { expiresAt: null }),
    );

    expect(decoded?.record).toStrictEqual(forever);
  });
});

describe("trust horizon", () => {
  it("mints a fresh horizon from its ttl when the directive is null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: null }),
    );

    expect(decoded?.token).toStrictEqual({
      expiresAt: new Date(T0.getTime() + MINUTE),
      expired: false,
    });
  });

  it("preserves a given horizon on sliding refresh", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const horizon = new Date(T0.getTime() + 30_000);
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: horizon }),
    );

    expect(decoded?.token).toStrictEqual({
      expiresAt: horizon,
      expired: false,
    });
  });

  /**
   * Core checks storage for revocation only after the trust horizon expires.
   * Rejecting the token here would silently disable that check.
   */
  it("flags an expired horizon but still returns the record", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const past = new Date(T0.getTime() - 1);
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: past }),
    );

    expect(decoded).toStrictEqual({
      record,
      token: { expiresAt: past, expired: true },
    });
  });
});

describe("invalid or forged tokens", () => {
  /**
   * Shape violations fail closed instead of escaping as parsing errors.
   * This evidence licenses decode's error boundary.
   */
  it.each([
    { name: "an empty token", token: "" },
    { name: "a token without a separator", token: "not-a-token" },
    { name: "a token with too many segments", token: "a.b.c" },
    { name: "a token without a signature", token: "body." },
  ])("decodes $name to null", async ({ token }) => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });

    expect(await codec.decode(token)).toBeNull();
  });

  it("decodes a token with an undecodable signature to null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });

    expect(await codec.decode("body.!!!not-base64url!!!")).toBeNull();
  });

  it("decodes a token signed with a different secret to null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const foreignCodec = makeSessionHmacCodec({
      secret: "secret-2",
      ttl: MINUTE,
    });
    const foreign = await foreignCodec.encode(record, { expiresAt: null });

    expect(await codec.decode(foreign)).toBeNull();
  });

  it.each([
    {
      part: "body",
      tamper: (token: string) =>
        (token.startsWith("A") ? "B" : "A") + token.slice(1),
    },
    {
      part: "signature",
      tamper: (token: string) =>
        token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"),
    },
  ])("decodes a token with a tampered $part to null", async ({ tamper }) => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const token = await codec.encode(record, { expiresAt: null });

    expect(await codec.decode(tamper(token))).toBeNull();
  });
});
