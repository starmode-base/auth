import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
  test("encode and decode preserve the session record", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: null }),
    );

    expect(decoded?.record).toStrictEqual(record);
  });

  test("decode returns the session record and token status encoded by another codec with the same secret", async () => {
    const encoder = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoder = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const token = await encoder.encode(record, { expiresAt: null });

    expect(await decoder.decode(token)).toStrictEqual({
      record,
      token: {
        expiresAt: new Date(T0.getTime() + MINUTE),
        expired: false,
      },
    });
  });

  test("encode and decode preserve a never-expiring session", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const forever = { ...record, expiresAt: null };
    const decoded = await codec.decode(
      await codec.encode(forever, { expiresAt: null }),
    );

    expect(decoded?.record).toStrictEqual(forever);
  });
});

describe("token expiry", () => {
  test("encode sets token expiry from the codec TTL when expiresAt is null", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: null }),
    );

    expect(decoded?.token).toStrictEqual({
      expiresAt: new Date(T0.getTime() + MINUTE),
      expired: false,
    });
  });

  test("encode mints each fresh token expiry from its invocation time", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const firstToken = await codec.encode(record, { expiresAt: null });
    const later = new Date(T0.getTime() + 30_000);

    // A later encode must receive a full TTL instead of reusing the first deadline.
    vi.setSystemTime(later);
    const secondToken = await codec.encode(record, { expiresAt: null });

    expect({
      first: (await codec.decode(firstToken))?.token,
      second: (await codec.decode(secondToken))?.token,
    }).toStrictEqual({
      first: {
        expiresAt: new Date(T0.getTime() + MINUTE),
        expired: false,
      },
      second: {
        expiresAt: new Date(later.getTime() + MINUTE),
        expired: false,
      },
    });
  });

  test("decode uses the token expiry embedded by the encoder", async () => {
    const encoder = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoder = makeSessionHmacCodec({
      secret: "secret-1",
      ttl: 2 * MINUTE,
    });
    const token = await encoder.encode(record, { expiresAt: null });

    expect((await decoder.decode(token))?.token).toStrictEqual({
      expiresAt: new Date(T0.getTime() + MINUTE),
      expired: false,
    });
  });

  test("encode preserves a supplied token expiry", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const tokenExpiry = new Date(T0.getTime() + 30_000);
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: tokenExpiry }),
    );

    expect(decoded?.token).toStrictEqual({
      expiresAt: tokenExpiry,
      expired: false,
    });
  });

  test("decode reports the token as unexpired when expiresAt equals now", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const decoded = await codec.decode(
      await codec.encode(record, { expiresAt: T0 }),
    );

    expect(decoded?.token.expired).toBe(false);
  });

  test("decode evaluates token expiry using the current time", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });

    // Encode while the token expiry is still in the future.
    const expiresAt = new Date(T0.getTime() + 30_000);
    const token = await codec.encode(record, { expiresAt });

    // Move the clock one millisecond past token expiry before decoding.
    vi.setSystemTime(new Date(expiresAt.getTime() + 1));

    const decoded = await codec.decode(token);

    expect(decoded?.token.expired).toBe(true);
  });

  /**
   * Core checks storage for revocation when token.expired is true, so decode
   * must retain the record.
   */
  test("decode reports the token as expired while preserving its record", async () => {
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
  test.each([
    { name: "an empty token", token: "" },
    { name: "a token without a separator", token: "not-a-token" },
    { name: "a token with too many segments", token: "a.b.c" },
    { name: "a token without a signature", token: "body." },
  ])("decode returns null for $name", async ({ token }) => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });

    expect(await codec.decode(token)).toBeNull();
  });

  test("decode returns null for a token with an undecodable signature", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });

    expect(await codec.decode("body.!!!not-base64url!!!")).toBeNull();
  });

  test("decode returns null for a signature-valid token with undecodable carried data", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const verify = vi.spyOn(crypto.subtle, "verify").mockResolvedValueOnce(true);

    try {
      // Authenticated but unreadable carried data is still an invalid token.
      expect(await codec.decode("ew.AA")).toBeNull();
    } finally {
      verify.mockRestore();
    }
  });

  test("decode returns null for a token signed with another secret", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const foreignCodec = makeSessionHmacCodec({
      secret: "secret-2",
      ttl: MINUTE,
    });
    const foreign = await foreignCodec.encode(record, { expiresAt: null });

    expect(await codec.decode(foreign)).toBeNull();
  });

  test.each([
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
  ])(
    "decode returns null for a token with a tampered $part",
    async ({ tamper }) => {
      const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
      const token = await codec.encode(record, { expiresAt: null });

      expect(await codec.decode(tamper(token))).toBeNull();
    },
  );

  test("decode propagates HMAC verification infrastructure failures", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const token = await codec.encode(record, { expiresAt: null });
    const failure = new Error("HMAC verification unavailable");
    const verification = vi
      .spyOn(crypto.subtle, "verify")
      .mockRejectedValueOnce(failure);

    try {
      await expect(codec.decode(token)).rejects.toBe(failure);
    } finally {
      verification.mockRestore();
    }
  });
});

describe("infrastructure failures", () => {
  test("encode propagates an HMAC signing infrastructure failure", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const failure = new Error("signing unavailable");
    const sign = vi.spyOn(crypto.subtle, "sign").mockRejectedValueOnce(failure);

    try {
      await expect(codec.encode(record, { expiresAt: null })).rejects.toBe(
        failure,
      );
    } finally {
      sign.mockRestore();
    }
  });

  test("decode propagates an HMAC verification infrastructure failure", async () => {
    const codec = makeSessionHmacCodec({ secret: "secret-1", ttl: MINUTE });
    const token = await codec.encode(record, { expiresAt: null });
    const failure = new Error("verification unavailable");
    const verify = vi
      .spyOn(crypto.subtle, "verify")
      .mockRejectedValueOnce(failure);

    try {
      await expect(codec.decode(token)).rejects.toBe(failure);
    } finally {
      verify.mockRestore();
    }
  });
});
