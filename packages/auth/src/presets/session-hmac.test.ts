import { describe, it, expect } from "vitest";
import { sessionHmac } from "./session-hmac";

describe("sessionHmac", () => {
  it("encode returns token with payload and signature", async () => {
    const codec = sessionHmac({ secret: "test-secret", ttl: 300 });
    const token = await codec.encode({ sessionId: "s1", userId: "u1" });

    const parts = token.split(".");
    const [payload, signature] = parts;

    expect(parts.length).toBe(2);
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
  });

  it("encode throws when HMAC signing fails", async () => {
    const codec = sessionHmac({ secret: "", ttl: 300 });
    await expect(
      codec.encode({ sessionId: "s1", userId: "u1" }),
    ).rejects.toThrow();
  });
});
