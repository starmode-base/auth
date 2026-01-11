import { describe, it, expect } from "vitest";
import { registrationHmac } from "./registration-hmac";

describe("registrationHmac", () => {
  it("encode returns token with payload and signature", async () => {
    const codec = registrationHmac({ secret: "test-secret", ttl: 300 });
    const token = await codec.encode({ userId: "u1", email: "a@example.com" });

    const parts = token.split(".");
    const [payload, signature] = parts;

    expect(parts.length).toBe(2);
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
  });

  it("encode throws when HMAC signing fails", async () => {
    const codec = registrationHmac({ secret: "", ttl: 300 });
    await expect(
      codec.encode({ userId: "u1", email: "a@example.com" }),
    ).rejects.toThrow();
  });
});
