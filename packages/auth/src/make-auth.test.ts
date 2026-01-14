import { describe, expect, it } from "vitest";
import {
  makeAuth,
  storageMemory,
  otpTransportConsole,
  sessionHmac,
  registrationHmac,
  sessionTransportMemory,
} from "./index";

describe("makeAuth", () => {
  const storage = storageMemory();
  const sessionTransport = sessionTransportMemory();

  const auth = makeAuth({
    storage,
    sessionCodec: sessionHmac({ secret: "test", ttl: 600 }),
    registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
    otpTransport: otpTransportConsole,
    webAuthn: {
      rpId: "localhost",
      rpName: "Test App",
    },
    sessionTransport,
    debug: false,
  });

  it("requestOtp returns success", async () => {
    const result = await auth.requestOtp("test@example.com");
    expect(result).toStrictEqual({ success: true });
  });

  it("verifyOtp returns success only (no session)", async () => {
    // Pre-populate OTP
    await storage.otp.store(
      "test@example.com",
      "123456",
      new Date(Date.now() + 60000),
    );

    const result = await auth.verifyOtp("test@example.com", "123456");
    expect(result).toStrictEqual({ success: true });
  });

  it("verifyOtp returns failure for wrong otp", async () => {
    const result = await auth.verifyOtp("test@example.com", "000000");
    expect(result).toStrictEqual({ success: false, error: "invalid_otp" });
  });

  it("createRegistrationToken returns token", async () => {
    const result = await auth.createRegistrationToken(
      "user_1",
      "test@example.com",
    );
    expect(result.registrationToken).toBeDefined();
  });

  it("validateRegistrationToken returns userId and identifier", async () => {
    const { registrationToken } = await auth.createRegistrationToken(
      "user_1",
      "test@example.com",
    );
    const result = await auth.validateRegistrationToken(registrationToken);
    expect(result).toStrictEqual({
      userId: "user_1",
      identifier: "test@example.com",
      success: true,
    });
  });

  it("validateRegistrationToken returns failure for bad token", async () => {
    const result = await auth.validateRegistrationToken("invalid-token");
    expect(result.success).toBe(false);
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

    sessionTransport.setToken(token);
    const session = await auth.getSession();
    expect(session).toStrictEqual({ userId: "user_1" });
  });

  it("getSession returns null for invalid token", async () => {
    sessionTransport.setToken("invalid-token");
    const session = await auth.getSession();
    expect(session).toBeNull();
  });

  it("signOut completes without error", async () => {
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

    sessionTransport.setToken(token);
    await expect(auth.signOut()).resolves.toBeUndefined();
  });
});
