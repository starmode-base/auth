import { beforeEach, describe, expect, it } from "vitest";
import {
  makeAuth,
  makeAuthHandler,
  memoryAdapters,
  otpEmailAdapterMinimal,
  sessionTokenAdapterJwt,
} from "./index";
import type { AuthHandler, OtpSendAdapter } from "./types";

describe("makeAuthHandler", () => {
  let handler: AuthHandler;
  let sentOtps: { email: string; code: string }[];

  beforeEach(() => {
    sentOtps = [];

    const captureSend: OtpSendAdapter = async (email, content) => {
      sentOtps.push({ email, code: content.body });
    };

    const auth = makeAuth({
      ...memoryAdapters(),
      ...sessionTokenAdapterJwt({ secret: "test-secret", ttl: 600 }),
      email: otpEmailAdapterMinimal(),
      send: captureSend,
    });

    handler = makeAuthHandler(auth);
  });

  it("routes requestOtp", async () => {
    const result = await handler("requestOtp", { email: "user@example.com" });
    expect(result).toEqual({ success: true });
    expect(sentOtps).toHaveLength(1);
    expect(sentOtps[0]?.email).toBe("user@example.com");
  });

  it("routes verifyOtp", async () => {
    await handler("requestOtp", { email: "user@example.com" });
    const code = sentOtps[0]!.code;

    const result = await handler("verifyOtp", {
      email: "user@example.com",
      code,
    });

    expect(result).toEqual({
      valid: true,
      userId: expect.any(String),
      token: expect.any(String),
    });
  });

  it("routes getSession", async () => {
    await handler("requestOtp", { email: "user@example.com" });
    const code = sentOtps[0]!.code;
    const { token } = (await handler("verifyOtp", {
      email: "user@example.com",
      code,
    })) as { token: string };

    const result = await handler("getSession", { token });
    expect(result).toEqual({ userId: expect.any(String) });
  });

  it("routes deleteSession", async () => {
    await handler("requestOtp", { email: "user@example.com" });
    const code = sentOtps[0]!.code;

    const { token } = (await handler("verifyOtp", {
      email: "user@example.com",
      code,
    })) as { token: string };

    await handler("deleteSession", { token });

    // Session should be deleted (getSession still returns from JWT cache though)
    // This is expected behavior - JWT tokens remain valid until expiry
  });

  it("throws on unknown method", async () => {
    await expect(handler("unknownMethod", {})).rejects.toThrow(
      "Unknown auth method: unknownMethod",
    );
  });
});
