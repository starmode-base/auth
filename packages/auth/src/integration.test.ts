import { beforeEach, describe, expect, it } from "vitest";
import {
  makeAuth,
  memoryOtpStorage,
  memorySessionStorage,
  memoryCredentialStorage,
  sessionHmac,
  registrationHmac,
  sessionTransportMemory,
} from "./index";
import type { OtpTransportAdapter } from "./types";
import type {
  MemoryOtpStorage,
  MemorySessionStorage,
  MemoryCredentialStorage,
} from "./presets/storage-memory";
import type { SessionTransportMemoryAdapter } from "./presets/session-transport-memory";

describe("auth integration", () => {
  let otpStorage: MemoryOtpStorage;
  let sessionStorage: MemorySessionStorage;
  let credentialStorage: MemoryCredentialStorage;
  let sentOtps: { identifier: string; otp: string }[];
  let auth: ReturnType<typeof makeAuth>;
  let sessionTransport: SessionTransportMemoryAdapter;

  beforeEach(() => {
    otpStorage = memoryOtpStorage();
    sessionStorage = memorySessionStorage();
    credentialStorage = memoryCredentialStorage();
    sentOtps = [];
    sessionTransport = sessionTransportMemory();

    const otpTransport: OtpTransportAdapter = {
      ttl: 10 * 60 * 1000,
      send: async (identifier, otp) => {
        sentOtps.push({ identifier, otp });
      },
    };

    auth = makeAuth({
      session: {
        storage: sessionStorage,
        codec: sessionHmac({ secret: "test-secret", ttl: 10 * 60 * 1000 }),
        transport: sessionTransport,
        ttl: Infinity,
      },
      otp: {
        storage: otpStorage,
        transport: otpTransport,
      },
      passkey: {
        storage: credentialStorage,
        registrationCodec: registrationHmac({
          secret: "test-secret",
          ttl: 300,
        }),
        webAuthn: {
          rpId: "localhost",
          rpName: "Test App",
          challengeTtl: 5 * 60 * 1000,
        },
      },
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
      await sessionStorage.store({
        sessionId: "session_1",
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60000),
      });
      const sessionCodec = sessionHmac({
        secret: "test-secret",
        ttl: 10 * 60 * 1000,
      });
      const token = await sessionCodec.encode({
        sessionId: "session_1",
        sessionExp: null,
        userId: "user_1",
      });

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
      await sessionStorage.store({
        sessionId: "session_1",
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60000),
      });
      const sessionCodec = sessionHmac({
        secret: "test-secret",
        ttl: 10 * 60 * 1000,
      });
      const token = await sessionCodec.encode({
        sessionId: "session_1",
        sessionExp: null,
        userId: "user_1",
      });

      sessionTransport.setToken(token);
      await auth.signOut();

      expect(sessionStorage._store.size).toBe(0);
    });
  });

  describe("signOutAll", () => {
    it("deletes all sessions for the current user", async () => {
      const codec = sessionHmac({
        secret: "test-secret",
        ttl: 10 * 60 * 1000,
      });

      await sessionStorage.store({
        sessionId: "session_a",
        userId: "user_1",
        expiresAt: null,
      });
      await sessionStorage.store({
        sessionId: "session_b",
        userId: "user_1",
        expiresAt: null,
      });

      const token = await codec.encode({
        sessionId: "session_a",
        sessionExp: null,
        userId: "user_1",
      });

      sessionTransport.setToken(token);
      await auth.signOutAll();

      expect(await sessionStorage.get("session_a")).toBeNull();
      expect(await sessionStorage.get("session_b")).toBeNull();
    });

    it("does not delete other users' sessions", async () => {
      const codec = sessionHmac({
        secret: "test-secret",
        ttl: 10 * 60 * 1000,
      });

      await sessionStorage.store({
        sessionId: "session_user1",
        userId: "user_1",
        expiresAt: null,
      });
      await sessionStorage.store({
        sessionId: "session_user2",
        userId: "user_2",
        expiresAt: null,
      });

      const token = await codec.encode({
        sessionId: "session_user1",
        sessionExp: null,
        userId: "user_1",
      });

      sessionTransport.setToken(token);
      await auth.signOutAll();

      expect(await sessionStorage.get("session_user1")).toBeNull();
      expect(await sessionStorage.get("session_user2")).not.toBeNull();
    });

    it("clears the session cookie", async () => {
      const codec = sessionHmac({
        secret: "test-secret",
        ttl: 10 * 60 * 1000,
      });

      await sessionStorage.store({
        sessionId: "session_1",
        userId: "user_1",
        expiresAt: null,
      });

      const token = await codec.encode({
        sessionId: "session_1",
        sessionExp: null,
        userId: "user_1",
      });

      sessionTransport.setToken(token);
      await auth.signOutAll();

      expect(sessionTransport.get()).toBeUndefined();
    });
  });

  describe("full OTP + registration token flow", () => {
    it("request OTP → verify → create registration token", async () => {
      await auth.requestOtp({ identifier: "user@example.com" });
      const otp = sentOtps[0]!.otp;

      const { success: success } = await auth.verifyOtp({
        identifier: "user@example.com",
        otp,
      });
      expect(success).toBe(true);

      const userId = "user_1";

      const { registrationToken } = await auth.createRegistrationToken({
        userId,
        identifier: "user@example.com",
      });
      expect(registrationToken).toBeDefined();

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

  describe("credential storage delete", () => {
    it("removes a credential by ID", async () => {
      await credentialStorage.store({
        userId: "user_1",
        credential: {
          id: "cred_1",
          publicKey: new Uint8Array(65),
          counter: 0,
        },
      });

      await credentialStorage.delete("cred_1");

      expect(await credentialStorage.getById("cred_1")).toBeNull();
    });

    it("removes credential from user's list", async () => {
      await credentialStorage.store({
        userId: "user_1",
        credential: {
          id: "cred_1",
          publicKey: new Uint8Array(65),
          counter: 0,
        },
      });
      await credentialStorage.store({
        userId: "user_1",
        credential: {
          id: "cred_2",
          publicKey: new Uint8Array(65),
          counter: 0,
        },
      });

      await credentialStorage.delete("cred_1");

      const remaining = await credentialStorage.get("user_1");
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe("cred_2");
    });

    it("does not affect other users' credentials", async () => {
      await credentialStorage.store({
        userId: "user_1",
        credential: {
          id: "cred_1",
          publicKey: new Uint8Array(65),
          counter: 0,
        },
      });
      await credentialStorage.store({
        userId: "user_2",
        credential: {
          id: "cred_2",
          publicKey: new Uint8Array(65),
          counter: 0,
        },
      });

      await credentialStorage.delete("cred_1");

      expect(await credentialStorage.getById("cred_2")).not.toBeNull();
    });
  });
});
