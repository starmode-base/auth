import { describe, expect, it } from "vitest";
import {
  makeAuth,
  storageMemory,
  otpSenderConsole,
  sessionHmac,
  registrationHmac,
} from "./index";

describe("makeAuth", () => {
  const storage = storageMemory();
  const auth = makeAuth({
    storage,
    session: sessionHmac({ secret: "test", ttl: 600 }),
    registration: registrationHmac({ secret: "test", ttl: 300 }),
    sendOtp: otpSenderConsole,
    webauthn: {
      rpId: "localhost",
      rpName: "Test App",
    },
  });

  it("requestOtp returns success", async () => {
    const result = await auth.requestOtp("test@example.com");
    expect(result).toEqual({ success: true });
  });

  it("verifyOtp returns valid only (no session)", async () => {
    // Pre-populate OTP
    await storage.otp.store(
      "test@example.com",
      "123456",
      new Date(Date.now() + 60000),
    );

    const result = await auth.verifyOtp("test@example.com", "123456");
    expect(result).toEqual({ valid: true });
  });

  it("verifyOtp returns invalid for wrong otp", async () => {
    const result = await auth.verifyOtp("test@example.com", "000000");
    expect(result).toEqual({ valid: false });
  });

  it("createRegistrationToken returns token", async () => {
    const result = await auth.createRegistrationToken(
      "user_1",
      "test@example.com",
    );
    expect(result.registrationToken).toBeDefined();
  });

  it("validateRegistrationToken returns userId and email", async () => {
    const { registrationToken } = await auth.createRegistrationToken(
      "user_1",
      "test@example.com",
    );
    const result = await auth.validateRegistrationToken(registrationToken);
    expect(result).toEqual({
      userId: "user_1",
      email: "test@example.com",
      valid: true,
    });
  });

  it("validateRegistrationToken returns invalid for bad token", async () => {
    const result = await auth.validateRegistrationToken("invalid-token");
    expect(result.valid).toBe(false);
  });

  it("getSession returns userId from token", async () => {
    // Create a session directly
    await storage.session.store(
      "session_1",
      "user_1",
      new Date(Date.now() + 60000),
    );
    const sessionCodec = sessionHmac({ secret: "test", ttl: 600 });
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

  it("deleteSession completes without error", async () => {
    // Create a session directly
    await storage.session.store(
      "session_2",
      "user_1",
      new Date(Date.now() + 60000),
    );
    const sessionCodec = sessionHmac({ secret: "test", ttl: 600 });
    const token = await sessionCodec.encode({
      sessionId: "session_2",
      userId: "user_1",
    });

    await expect(auth.deleteSession(token)).resolves.toBeUndefined();
  });
});
