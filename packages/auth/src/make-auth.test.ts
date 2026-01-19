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
    sessionCodec: sessionHmac({ secret: "test", ttl: 10 * 60 * 1000 }), // 10 min
    registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
    otpTransport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
    webAuthn: {
      rpId: "localhost",
      rpName: "Test App",
      challengeTtl: 5 * 60 * 1000,
    },
    sessionTransport,
    sessionTtl: Infinity,
    debug: false,
  });

  it("requestOtp returns success", async () => {
    const result = await auth.requestOtp({ identifier: "test@example.com" });
    expect(result).toStrictEqual({ success: true });
  });

  it("verifyOtp returns success only (no session)", async () => {
    // Pre-populate OTP
    await storage.otp.store({
      identifier: "test@example.com",
      otp: "123456",
      expiresAt: new Date(Date.now() + 60000),
    });

    const result = await auth.verifyOtp({
      identifier: "test@example.com",
      otp: "123456",
    });
    expect(result).toStrictEqual({ success: true });
  });

  it("verifyOtp returns failure for wrong otp", async () => {
    const result = await auth.verifyOtp({
      identifier: "test@example.com",
      otp: "000000",
    });
    expect(result).toStrictEqual({ success: false, error: "invalid_otp" });
  });

  it("createRegistrationToken returns token", async () => {
    const result = await auth.createRegistrationToken({
      userId: "user_1",
      identifier: "test@example.com",
    });
    expect(result.registrationToken).toBeDefined();
  });

  it("validateRegistrationToken returns userId and identifier", async () => {
    const { registrationToken } = await auth.createRegistrationToken({
      userId: "user_1",
      identifier: "test@example.com",
    });
    const result = await auth.validateRegistrationToken({
      token: registrationToken,
    });
    expect(result).toStrictEqual({
      userId: "user_1",
      identifier: "test@example.com",
      success: true,
    });
  });

  it("validateRegistrationToken returns failure for bad token", async () => {
    const result = await auth.validateRegistrationToken({
      token: "invalid-token",
    });
    expect(result.success).toBe(false);
  });

  it("getSession returns userId from token", async () => {
    // Create a session directly
    await storage.session.store({
      sessionId: "session_1",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60000),
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 10 * 60 * 1000 }); // 10 min
    const token = await sessionCodec.encode({
      sessionId: "session_1",
      sessionExp: null, // forever for this test
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
    await storage.session.store({
      sessionId: "session_2",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60000),
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 10 * 60 * 1000 }); // 10 min
    const token = await sessionCodec.encode({
      sessionId: "session_2",
      sessionExp: null, // forever for this test
      userId: "user_1",
    });

    sessionTransport.setToken(token);
    await expect(auth.signOut()).resolves.toBeUndefined();
  });
});

describe("makeAuth sessionTtl", () => {
  it("forever session (null expiresAt) is always valid", async () => {
    const storage = storageMemory();
    const sessionTransport = sessionTransportMemory();

    const auth = makeAuth({
      storage,
      sessionCodec: sessionHmac({ secret: "test", ttl: 50 }), // 50ms token TTL
      registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
      otpTransport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
      webAuthn: {
        rpId: "localhost",
        rpName: "Test App",
        challengeTtl: 5 * 60 * 1000,
      },
      sessionTransport,
      sessionTtl: Infinity,
      debug: false,
    });

    // Create session with null expiresAt (forever)
    await storage.session.store({
      sessionId: "session_forever",
      userId: "user_1",
      expiresAt: null,
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 50 }); // 50ms
    const token = await sessionCodec.encode({
      sessionId: "session_forever",
      sessionExp: null, // forever
      userId: "user_1",
    });

    // Wait for token to expire
    await new Promise((r) => setTimeout(r, 100));

    sessionTransport.setToken(token);
    const session = await auth.getSession();

    // Session should still be valid (forever)
    expect(session).toStrictEqual({ userId: "user_1" });
  });

  it("inactivity timeout expires session after TTL", async () => {
    const storage = storageMemory();
    const sessionTransport = sessionTransportMemory();

    const auth = makeAuth({
      storage,
      sessionCodec: sessionHmac({ secret: "test", ttl: 10000 }), // 10s token TTL (won't expire during test)
      registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
      otpTransport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
      webAuthn: {
        rpId: "localhost",
        rpName: "Test App",
        challengeTtl: 5 * 60 * 1000,
      },
      sessionTransport,
      sessionTtl: 50, // 50ms inactivity timeout
      debug: false,
    });

    // Create session with short expiry
    const sessionExp = new Date(Date.now() + 50);
    await storage.session.store({
      sessionId: "session_expiring",
      userId: "user_1",
      expiresAt: sessionExp,
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 10000 });
    const token = await sessionCodec.encode({
      sessionId: "session_expiring",
      sessionExp,
      userId: "user_1",
    });

    // Wait for sessionExp to expire
    await new Promise((r) => setTimeout(r, 100));

    sessionTransport.setToken(token);
    const session = await auth.getSession();

    // Session should be null (expired)
    expect(session).toBeNull();
  });

  it("sliding refresh updates expiresAt on DB fallback", async () => {
    const storage = storageMemory();
    const sessionTransport = sessionTransportMemory();
    const sessionTtl = 10000; // 10s session TTL

    const auth = makeAuth({
      storage,
      sessionCodec: sessionHmac({ secret: "test", ttl: 50 }), // 50ms token TTL
      registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
      otpTransport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
      webAuthn: {
        rpId: "localhost",
        rpName: "Test App",
        challengeTtl: 5 * 60 * 1000,
      },
      sessionTransport,
      sessionTtl,
      debug: false,
    });

    // Create session
    const sessionExp = new Date(Date.now() + sessionTtl);
    await storage.session.store({
      sessionId: "session_sliding",
      userId: "user_1",
      expiresAt: sessionExp,
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 50 }); // 50ms
    // sessionExp is long (10s), tokenExp is short (50ms)
    const token = await sessionCodec.encode({
      sessionId: "session_sliding",
      sessionExp,
      userId: "user_1",
    });

    // Wait for tokenExp to expire but not sessionExp
    await new Promise((r) => setTimeout(r, 100));

    sessionTransport.setToken(token);
    const session = await auth.getSession();

    // Session should still be valid
    expect(session).toStrictEqual({ userId: "user_1" });

    // Check that expiresAt was updated (sliding refresh)
    const storedSession = await storage.session.get("session_sliding");
    expect(storedSession).not.toBeNull();
    expect(storedSession!.expiresAt).not.toBeNull();
    // New expiry should be later than initial (refresh happened after 100ms)
    expect(storedSession!.expiresAt!.getTime()).toBeGreaterThan(
      sessionExp.getTime(),
    );
  });
});
