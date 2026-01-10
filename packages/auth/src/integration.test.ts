import { beforeEach, describe, expect, it } from "vitest";
import {
  makeAuth,
  makeMemoryAdapters,
  makeSessionHmac,
  makeRegistrationHmac,
} from "./index";
import type { OtpAdapter } from "./types";

describe("auth integration", () => {
  let storage: ReturnType<typeof makeMemoryAdapters>;
  let sentOtps: { email: string; code: string }[];
  let auth: ReturnType<typeof makeAuth>;

  beforeEach(() => {
    storage = makeMemoryAdapters();
    sentOtps = [];

    const captureSend: OtpAdapter = async (email, code) => {
      sentOtps.push({ email, code });
    };

    auth = makeAuth({
      storage,
      session: makeSessionHmac({ secret: "test-secret", ttl: 600 }),
      registration: makeRegistrationHmac({
        secret: "test-secret",
        ttl: 300,
      }),
      otp: captureSend,
      webauthn: {
        rpId: "localhost",
        rpName: "Test App",
      },
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
    });

    it("rejects wrong OTP", async () => {
      await auth.requestOtp("user@example.com");

      const result = await auth.verifyOtp("user@example.com", "000000");
      expect(result.valid).toBe(false);
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

  describe("registration token flow", () => {
    it("creates registration token after OTP verify", async () => {
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;

      const { valid } = await auth.verifyOtp("user@example.com", code);
      expect(valid).toBe(true);

      // App would upsert user here, then:
      const { registrationToken } = await auth.createRegistrationToken(
        "user_1",
        "user@example.com",
      );
      expect(registrationToken).toBeDefined();
    });

    it("validates registration token", async () => {
      const { registrationToken } = await auth.createRegistrationToken(
        "user_1",
        "user@example.com",
      );
      const result = await auth.validateRegistrationToken(registrationToken);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user_1");
      expect(result.email).toBe("user@example.com");
    });
  });

  describe("session management", () => {
    it("getSession returns userId from valid token", async () => {
      // Directly create a session for testing
      await storage.session.store(
        "session_1",
        "user_1",
        new Date(Date.now() + 60000),
      );
      const sessionCodec = makeSessionHmac({
        secret: "test-secret",
        ttl: 600,
      });
      const token = await sessionCodec.encode({
        sessionId: "session_1",
        userId: "user_1",
      });

      const session = await auth.getSession(token);
      expect(session).toEqual({ userId: "user_1" });
    });

    it("getSession returns null for invalid token", async () => {
      const session = await auth.getSession("invalid-token");
      expect(session).toBeNull();
    });

    it("deleteSession removes session", async () => {
      await storage.session.store(
        "session_1",
        "user_1",
        new Date(Date.now() + 60000),
      );
      const sessionCodec = makeSessionHmac({
        secret: "test-secret",
        ttl: 600,
      });
      const token = await sessionCodec.encode({
        sessionId: "session_1",
        userId: "user_1",
      });

      await auth.deleteSession(token);

      expect(storage._stores.sessions.size).toBe(0);
    });
  });

  describe("full OTP + registration token flow", () => {
    it("request OTP → verify → create registration token", async () => {
      // Request OTP
      await auth.requestOtp("user@example.com");
      const code = sentOtps[0]!.code;

      // Verify OTP
      const { valid } = await auth.verifyOtp("user@example.com", code);
      expect(valid).toBe(true);

      // App upserts user (simulated)
      const userId = "user_1";

      // Create registration token
      const { registrationToken } = await auth.createRegistrationToken(
        userId,
        "user@example.com",
      );
      expect(registrationToken).toBeDefined();

      // Validate it
      const validation =
        await auth.validateRegistrationToken(registrationToken);
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);
    });
  });
});
