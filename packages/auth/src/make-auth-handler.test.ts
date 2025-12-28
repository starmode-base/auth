import { beforeEach, describe, expect, it } from "vitest";
import {
  makeAuth,
  makeCookieAuth,
  makeAuthHandler,
  makeMemoryAdapters,
  otpEmailMinimal,
  makeSessionTokenJwt,
} from "./index";
import type { AuthHandler, OtpSendAdapter } from "./types";

describe("makeAuthHandler", () => {
  let handler: AuthHandler;
  let sentOtps: { email: string; code: string }[];
  let sessionCookie: string | undefined;

  beforeEach(() => {
    sentOtps = [];
    sessionCookie = undefined;

    const captureSend: OtpSendAdapter = async (email, content) => {
      sentOtps.push({ email, code: content.body });
    };

    const auth = makeAuth({
      ...makeMemoryAdapters(),
      ...makeSessionTokenJwt({ secret: "test-secret", ttl: 600 }),
      email: otpEmailMinimal,
      send: captureSend,
    });

    const cookieAuth = makeCookieAuth({
      auth,
      cookie: {
        get: () => sessionCookie,
        set: (token) => {
          sessionCookie = token;
        },
        clear: () => {
          sessionCookie = undefined;
        },
      },
    });

    handler = makeAuthHandler(cookieAuth);
  });

  it("routes requestOtp", async () => {
    const result = await handler({
      method: "requestOtp",
      email: "user@example.com",
    });
    expect(result).toEqual({ success: true });
    expect(sentOtps).toHaveLength(1);
    expect(sentOtps[0]?.email).toBe("user@example.com");
  });

  it("routes verifyOtp and sets cookie", async () => {
    await handler({ method: "requestOtp", email: "user@example.com" });
    const code = sentOtps[0]!.code;

    const result = await handler({
      method: "verifyOtp",
      email: "user@example.com",
      code,
    });

    expect(result).toEqual({
      valid: true,
      userId: expect.any(String),
    });
    // Cookie should be set by makeCookieAuth
    expect(sessionCookie).toBeDefined();
  });

  it("routes getSession using cookie", async () => {
    await handler({ method: "requestOtp", email: "user@example.com" });
    const code = sentOtps[0]!.code;
    await handler({ method: "verifyOtp", email: "user@example.com", code });

    const result = await handler({ method: "getSession" });
    expect(result).toEqual({ userId: expect.any(String) });
  });

  it("returns null for getSession when no cookie", async () => {
    const result = await handler({ method: "getSession" });
    expect(result).toBeNull();
  });

  it("routes signOut and clears cookie", async () => {
    await handler({ method: "requestOtp", email: "user@example.com" });
    const code = sentOtps[0]!.code;
    await handler({ method: "verifyOtp", email: "user@example.com", code });

    expect(sessionCookie).toBeDefined();

    await handler({ method: "signOut" });

    expect(sessionCookie).toBeUndefined();
  });
});
