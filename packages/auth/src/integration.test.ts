import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeAuth,
  memoryAdapters,
  otpEmailAdapterMinimal,
  sessionTokenAdapterJwt,
} from "./index";
import type { OtpSendAdapter } from "./types";

describe("auth integration", () => {
  let memory: ReturnType<typeof memoryAdapters>;
  let sentOtps: { email: string; code: string }[];
  let auth: ReturnType<typeof makeAuth>;

  beforeEach(() => {
    memory = memoryAdapters();
    sentOtps = [];

    const captureSend: OtpSendAdapter = async (email, content) => {
      sentOtps.push({ email, code: content.body });
    };

    auth = makeAuth({
      ...memory,
      ...sessionTokenAdapterJwt({ secret: "test-secret", ttl: 600 }),
      email: otpEmailAdapterMinimal(),
      send: captureSend,
    });
  });

  describe("OTP flow", () => {
    it("sends OTP to email", async () => {
      await auth.requestOtp("user@example.com");
      expect(sentOtps).toHaveLength(1);
      expect(sentOtps[0]?.email).toBe("user@example.com");
      expect(sentOtps[0]?.code).toMatch(/^\d{6}$/);
    });

    it("verifies correct OTP", async () => {
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;

      const result = await auth.verifyOtp("user@example.com", code);
      expect(result.valid).toBe(true);
      expect(result.userId).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it("rejects wrong OTP", async () => {
      await auth.requestOtp("user@example.com");

      const result = await auth.verifyOtp("user@example.com", "000000");
      expect(result.valid).toBe(false);
      expect(result.userId).toBeUndefined();
      expect(result.token).toBeUndefined();
    });

    it("rejects OTP for wrong email", async () => {
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;

      const result = await auth.verifyOtp("other@example.com", code);
      expect(result.valid).toBe(false);
    });

    it("OTP can only be used once", async () => {
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;

      const first = await auth.verifyOtp("user@example.com", code);
      expect(first.valid).toBe(true);

      const second = await auth.verifyOtp("user@example.com", code);
      expect(second.valid).toBe(false);
    });
  });

  describe("user creation", () => {
    it("creates new user on first OTP verify", async () => {
      await auth.requestOtp("new@example.com");
      const code = sentOtps[0]!.code;

      await auth.verifyOtp("new@example.com", code);

      const user = memory._stores.users.get("new@example.com");
      expect(user).toBeDefined();
      expect(user?.userId).toBe("user_1");
    });

    it("returns same userId for existing user", async () => {
      await auth.requestOtp("user@example.com");
      const code1 = sentOtps[0]!.code;
      const result1 = await auth.verifyOtp("user@example.com", code1);

      await auth.requestOtp("user@example.com");
      const code2 = sentOtps[1]!.code;
      const result2 = await auth.verifyOtp("user@example.com", code2);

      expect(result1.userId).toBe(result2.userId);
    });
  });

  describe("session management", () => {
    it("creates session on OTP verify", async () => {
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;
      await auth.verifyOtp("user@example.com", code);

      expect(memory._stores.sessions.size).toBe(1);
    });

    it("getSession returns userId from valid token", async () => {
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;
      const { token } = await auth.verifyOtp("user@example.com", code);

      const session = await auth.getSession(token!);
      expect(session).toEqual({ userId: "user_1" });
    });

    it("getSession returns null for invalid token", async () => {
      const session = await auth.getSession("invalid-token");
      expect(session).toBeNull();
    });

    it("deleteSession removes session", async () => {
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;
      const { token } = await auth.verifyOtp("user@example.com", code);

      await auth.deleteSession(token!);

      expect(memory._stores.sessions.size).toBe(0);
    });
  });

  describe("full flow", () => {
    it("sign up → get session → sign out", async () => {
      // Sign up
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;
      const { valid, token } = await auth.verifyOtp("user@example.com", code);
      expect(valid).toBe(true);

      // Authenticated - can get session
      const session = await auth.getSession(token!);
      expect(session?.userId).toBe("user_1");

      // Sign out
      await auth.deleteSession(token!);

      // Session deleted from store
      expect(memory._stores.sessions.size).toBe(0);
    });
  });
});
