import { describe, it, expect, vi } from "vitest";
import { makeHmacCodec, toExpTimestamp } from "./hmac-codec";

describe("toExpTimestamp", () => {
  it("returns timestamp from expiresAt date", () => {
    const date = new Date("2025-01-01T00:00:00Z");
    const result = toExpTimestamp({ expiresAt: date });
    expect(result).toBe(date.getTime());
  });

  it("returns timestamp from expiresInMs", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const result = toExpTimestamp({ expiresInMs: 60_000 });
    expect(result).toBe(now + 60_000);

    vi.useRealTimers();
  });
});

describe("makeHmacCodec", () => {
  it("encode with expiresInMs returns token with payload and signature", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
    });
    const token = await codec.encode({ foo: "bar" }, { expiresInMs: 300_000 });

    const parts = token.split(".");
    const [payload, signature] = parts;

    expect(parts.length).toBe(2);
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
  });

  it("encode with expiresAt returns token with correct exp", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
    });
    const expiresAt = new Date(Date.now() + 300_000);
    const token = await codec.encode({ foo: "bar" }, { expiresAt });
    const result = await codec.decode(token);

    expect(result?.exp.getTime()).toBe(expiresAt.getTime());
  });

  it("encode throws when HMAC signing fails", async () => {
    const codec = makeHmacCodec<{ foo: string }>({ secret: "" });
    await expect(
      codec.encode({ foo: "bar" }, { expiresInMs: 300_000 }),
    ).rejects.toThrow();
  });

  it("decode returns payload with exp/expired", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
    });
    const token = await codec.encode({ foo: "bar" }, { expiresInMs: 300_000 });
    const result = await codec.decode(token);

    expect(result).toStrictEqual({
      foo: "bar",
      expired: false,
      exp: expect.any(Date),
    });
  });

  it("decode returns null for invalid signature", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
    });
    const result = await codec.decode("invalid.token");

    expect(result).toBeNull();
  });

  it("decode returns null for tampered token", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
    });
    const token = await codec.encode({ foo: "bar" }, { expiresInMs: 300_000 });
    const [payload, signature] = token.split(".");
    const tampered = `${payload}x.${signature}`;

    expect(await codec.decode(tampered)).toBeNull();
  });

  it("decode returns expired flag for expired token", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
    });
    const token = await codec.encode({ foo: "bar" }, { expiresInMs: -1 });
    const result = await codec.decode(token);

    expect(result).toStrictEqual({
      foo: "bar",
      expired: true,
      exp: expect.any(Date),
    });
  });
});
