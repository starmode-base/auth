import { beforeEach, describe, expect, it } from "vitest";
import {
  makeAuth,
  storageMemory,
  sessionHmac,
  registrationHmac,
} from "./index";
import type { OtpSender } from "./types";

describe("auth integration", () => {
  let storage: ReturnType<typeof storageMemory>;
  let sentOtps: { email: string; otp: string }[];
  let auth: ReturnType<typeof makeAuth>;

  beforeEach(() => {
    storage = storageMemory();
    sentOtps = [];

    const captureSend: OtpSender = async (email, otp) => {
      sentOtps.push({ email, otp });
    };

    auth = makeAuth({
      storage,
      session: sessionHmac({ secret: "test-secret", ttl: 600 }),
      registration: registrationHmac({
        secret: "test-secret",
        ttl: 300,
      }),
      sendOtp: captureSend,
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
      expect(sentOtps[0]?.otp).toMatch(/^\d{6}$/);
    });

    it("verifies correct OTP", async () => {
      await auth.requestOtp("user@example.com");
      const otp = sentOtps[0]!.otp;

      const result = await auth.verifyOtp("user@example.com", otp);
      expect(result.success).toBe(true);
    });

    it("rejects wrong OTP", async () => {
      await auth.requestOtp("user@example.com");

      const result = await auth.verifyOtp("user@example.com", "000000");
      expect(result.success).toBe(false);
    });

    it("rejects OTP for wrong email", async () => {
      await auth.requestOtp("user@example.com");
      const otp = sentOtps[0]!.otp;

      const result = await auth.verifyOtp("other@example.com", otp);
      expect(result.success).toBe(false);
    });

    it("OTP can only be used once", async () => {
      await auth.requestOtp("user@example.com");
      const otp = sentOtps[0]!.otp;

      const first = await auth.verifyOtp("user@example.com", otp);
      expect(first.success).toBe(true);

      const second = await auth.verifyOtp("user@example.com", otp);
      expect(second.success).toBe(false);
    });
  });

  describe("registration token flow", () => {
    it("creates registration token after OTP verify", async () => {
      await auth.requestOtp("user@example.com");
      const otp = sentOtps[0]!.otp;

      const { success: success } = await auth.verifyOtp(
        "user@example.com",
        otp,
      );
      expect(success).toBe(true);

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

      expect(result).toStrictEqual({
        success: true,
        userId: "user_1",
        email: "user@example.com",
      });
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
      const sessionCodec = sessionHmac({
        secret: "test-secret",
        ttl: 600,
      });
      const token = await sessionCodec.encode({
        sessionId: "session_1",
        userId: "user_1",
      });

      const session = await auth.getSession(token);
      expect(session).toStrictEqual({ userId: "user_1" });
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
      const sessionCodec = sessionHmac({
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
      const otp = sentOtps[0]!.otp;

      // Verify OTP
      const { success: success } = await auth.verifyOtp(
        "user@example.com",
        otp,
      );
      expect(success).toBe(true);

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

      expect(validation).toStrictEqual({
        success: true,
        userId,
        email: "user@example.com",
      });
    });
  });
});
