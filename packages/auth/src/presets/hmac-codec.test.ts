import { describe, it, expect } from "vitest";
import { makeHmacCodec } from "./hmac-codec";

describe("makeHmacCodec", () => {
  it("encode returns token with payload and signature", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
      ttl: 300,
    });
    const token = await codec.encode({ foo: "bar" });

    const parts = token.split(".");
    const [payload, signature] = parts;

    expect(parts.length).toBe(2);
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
  });

  it("encode throws when HMAC signing fails", async () => {
    const codec = makeHmacCodec<{ foo: string }>({ secret: "", ttl: 300 });
    await expect(codec.encode({ foo: "bar" })).rejects.toThrow();
  });

  it("decode returns payload with valid/expired flags", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
      ttl: 300,
    });
    const token = await codec.encode({ foo: "bar" });
    const result = await codec.decode(token);

    expect(result).toStrictEqual({
      foo: "bar",
      valid: true,
      expired: false,
      exp: expect.any(Number),
    });
  });

  it("decode returns null for invalid signature", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
      ttl: 300,
    });
    const result = await codec.decode("invalid.token");

    expect(result).toBeNull();
  });

  it("decode returns null for tampered token", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
      ttl: 300,
    });
    const token = await codec.encode({ foo: "bar" });
    const [payload, signature] = token.split(".");
    const tampered = `${payload}x.${signature}`;

    expect(await codec.decode(tampered)).toBeNull();
  });

  it("decode returns expired flag for expired token", async () => {
    const codec = makeHmacCodec<{ foo: string }>({
      secret: "test-secret",
      ttl: -1,
    });
    const token = await codec.encode({ foo: "bar" });
    const result = await codec.decode(token);

    // valid = signature verified, expired = past exp time
    expect(result).toStrictEqual({
      foo: "bar",
      valid: true,
      expired: true,
      exp: expect.any(Number),
    });
  });
});
