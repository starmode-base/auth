import { beforeEach, describe, expect, it } from "vitest";
import {
  makeAuth,
  storageMemory,
  sessionHmac,
  registrationHmac,
  sessionTransportMemory,
} from "./index";
import type { OtpTransportAdapter } from "./types";
import type { SessionTransportMemoryAdapter } from "./presets/session-transport-memory";

describe("auth integration", () => {
  let storage: ReturnType<typeof storageMemory>;
  let sentOtps: { identifier: string; otp: string }[];
  let auth: ReturnType<typeof makeAuth>;
  let sessionTransport: SessionTransportMemoryAdapter;

  beforeEach(() => {
    storage = storageMemory();
    sentOtps = [];
    sessionTransport = sessionTransportMemory();

    const otpTransport: OtpTransportAdapter = {
      ttl: 10 * 60 * 1000,
      send: async (identifier, otp) => {
        sentOtps.push({ identifier, otp });
      },
    };

    auth = makeAuth({
      storage,
      sessionCodec: sessionHmac({ secret: "test-secret", ttl: 10 * 60 * 1000 }), // 10 min
      registrationCodec: registrationHmac({
        secret: "test-secret",
        ttl: 300,
      }),
      otpTransport,
      webAuthn: {
        rpId: "localhost",
        rpName: "Test App",
        challengeTtl: 5 * 60 * 1000,
      },
      sessionTransport,
      sessionTtl: Infinity,
      debug: false,
    });
  });

  describe("OTP flow", () => {
    it("sends OTP to identifier", async () => {
      await auth.requestOtp({ identifier: "user@example.com" });
      expect(sentOtps).toHaveLength(1);
      expect(sentOtps[0]?.identifier).toBe("user@example.com");
      expect(sentOtps[0]?.otp).toMatch(/^\d{6}$/);
    });

    it("verifies correct OTP", async () => {
      await auth.requestOtp({ identifier: "user@example.com" });
      const otp = sentOtps[0]!.otp;

      const result = await auth.verifyOtp({
        identifier: "user@example.com",
        otp,
      });
      expect(result.success).toBe(true);
    });

    it("rejects wrong OTP", async () => {
      await auth.requestOtp({ identifier: "user@example.com" });

      const result = await auth.verifyOtp({
        identifier: "user@example.com",
        otp: "000000",
      });
      expect(result.success).toBe(false);
    });

    it("rejects OTP for wrong identifier", async () => {
      await auth.requestOtp({ identifier: "user@example.com" });
      const otp = sentOtps[0]!.otp;

      const result = await auth.verifyOtp({
        identifier: "other@example.com",
        otp,
      });
      expect(result.success).toBe(false);
    });

    it("OTP can only be used once", async () => {
      await auth.requestOtp({ identifier: "user@example.com" });
      const otp = sentOtps[0]!.otp;

      const first = await auth.verifyOtp({
        identifier: "user@example.com",
        otp,
      });
      expect(first.success).toBe(true);

      const second = await auth.verifyOtp({
        identifier: "user@example.com",
        otp,
      });
      expect(second.success).toBe(false);
    });
  });

  describe("registration token flow", () => {
    it("creates registration token after OTP verify", async () => {
      await auth.requestOtp({ identifier: "user@example.com" });
      const otp = sentOtps[0]!.otp;

      const { success: success } = await auth.verifyOtp({
        identifier: "user@example.com",
        otp,
      });
      expect(success).toBe(true);

      // App would upsert user here, then:
      const { registrationToken } = await auth.createRegistrationToken({
        userId: "user_1",
        identifier: "user@example.com",
      });
      expect(registrationToken).toBeDefined();
    });

    it("validates registration token", async () => {
      const { registrationToken } = await auth.createRegistrationToken({
        userId: "user_1",
        identifier: "user@example.com",
      });
      const result = await auth.validateRegistrationToken({
        token: registrationToken,
      });

      expect(result).toStrictEqual({
        success: true,
        userId: "user_1",
        identifier: "user@example.com",
      });
    });
  });

  describe("session management", () => {
    it("getSession returns userId from valid token", async () => {
      // Directly create a session for testing
      await storage.session.store({
        sessionId: "session_1",
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60000),
      });
      const sessionCodec = sessionHmac({
        secret: "test-secret",
        ttl: 10 * 60 * 1000, // 10 min
      });
      const token = await sessionCodec.encode({
        sessionId: "session_1",
        sessionExp: null, // forever for this test
        userId: "user_1",
      });

      // Set token in transport
      sessionTransport.setToken(token);

      const session = await auth.getSession();
      expect(session).toStrictEqual({ userId: "user_1" });
    });

    it("getSession returns null for invalid token", async () => {
      sessionTransport.setToken("invalid-token");
      const session = await auth.getSession();
      expect(session).toBeNull();
    });

    it("signOut removes session", async () => {
      await storage.session.store({
        sessionId: "session_1",
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60000),
      });
      const sessionCodec = sessionHmac({
        secret: "test-secret",
        ttl: 10 * 60 * 1000, // 10 min
      });
      const token = await sessionCodec.encode({
        sessionId: "session_1",
        sessionExp: null, // forever for this test
        userId: "user_1",
      });

      sessionTransport.setToken(token);
      await auth.signOut();

      expect(storage._stores.sessions.size).toBe(0);
    });
  });

  describe("full OTP + registration token flow", () => {
    it("request OTP → verify → create registration token", async () => {
      // Request OTP
      await auth.requestOtp({ identifier: "user@example.com" });
      const otp = sentOtps[0]!.otp;

      // Verify OTP
      const { success: success } = await auth.verifyOtp({
        identifier: "user@example.com",
        otp,
      });
      expect(success).toBe(true);

      // App upserts user (simulated)
      const userId = "user_1";

      // Create registration token
      const { registrationToken } = await auth.createRegistrationToken({
        userId,
        identifier: "user@example.com",
      });
      expect(registrationToken).toBeDefined();

      // Validate it
      const validation = await auth.validateRegistrationToken({
        token: registrationToken,
      });

      expect(validation).toStrictEqual({
        success: true,
        userId,
        identifier: "user@example.com",
      });
    });
  });
});
