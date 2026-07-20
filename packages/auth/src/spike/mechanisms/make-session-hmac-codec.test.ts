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

describe("makeSessionHmacCodec", () => {
  /**
   * Contract: "Self-contained tokens carry the session record"
   */
  it("carries the session record through encode and decode", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: null }),
    );

    expect(decoded?.record).toEqual(record);
  });

  /**
   * Contract: "token.expiresAt: null mints a fresh horizon from the codec's own TTL"
   */
  it("mints a fresh horizon from its ttl when the directive is null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: null }),
    );

    expect(decoded?.token).toEqual({
      expiresAt: new Date(T0.getTime() + MINUTE),
      expired: false,
    });
  });

  /**
   * Contract: "a Date preserves the existing horizon (sliding refresh)"
   */
  it("preserves a given horizon on sliding refresh", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const horizon = new Date(T0.getTime() + 30_000);
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: horizon }),
    );

    expect(decoded?.token).toEqual({ expiresAt: horizon, expired: false });
  });

  /**
   * Contract: "expiresAt < now, computed by the codec — the codec owns the token clock"
   * Why: core's revocation check only runs on expired tokens, so an expired
   * token must decode with the record intact. A codec that rejects expired
   * tokens (e.g. a naive JWT wrapper) would silently disable revocation.
   */
  it("flags an expired horizon but still returns the record", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const past = new Date(T0.getTime() - 1);
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: past }),
    );

    expect(decoded).toEqual({
      record,
      token: { expiresAt: past, expired: true },
    });
  });

  /**
   * Contract: "null = never expires"
   */
  it("round-trips a never-expiring session", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const forever = { ...record, expiresAt: null };
    const decoded = await codec.decode(
      await codec.encode(forever, { expiresAt: null }),
    );

    expect(decoded?.record).toEqual(forever);
  });

  /**
   * Contract: "Invalid or forged tokens decode to null"
   * Why: shape violations must fail closed, never throw — this test licenses
   * the try/catch inside decode (prove-the-error rule).
   */
  it("decodes a structurally malformed token to null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });

    expect(await codec.decode("")).toBeNull();
    expect(await codec.decode("not-a-token")).toBeNull();
    expect(await codec.decode("a.b.c")).toBeNull();
    expect(await codec.decode("body.")).toBeNull();
  });

  /**
   * Contract: "Invalid or forged tokens decode to null"
   */
  it("decodes a token with an undecodable signature to null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });

    expect(await codec.decode("body.!!!not-base64url!!!")).toBeNull();
  });

  /**
   * Contract: "Invalid or forged tokens decode to null"
   * Why: the core forgery property — a signature minted with any other
   * secret must not validate.
   */
  it("decodes a token signed with a different secret to null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const foreignCodec = makeSessionHmacCodec({
      secret: "secret-2",
      ttl: MINUTE,
    });
    const foreign = await foreignCodec.encode(record, { expiresAt: null });

    expect(await codec.decode(foreign)).toBeNull();
  });

  /**
   * Contract: "Invalid or forged tokens decode to null"
   * Why: integrity covers both halves — a flipped bit in the body or in the
   * signature must invalidate the token.
   */
  it("decodes a tampered token to null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const token = await codec.encode(record, { expiresAt: null });
    const tamperedBody = (token.startsWith("A") ? "B" : "A") + token.slice(1);
    const tamperedSignature =
      token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");

    expect(await codec.decode(tamperedBody)).toBeNull();
    expect(await codec.decode(tamperedSignature)).toBeNull();
  });
});
