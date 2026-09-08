import { describe, expect, it } from "vitest";
import {
  makeAuth,
  memoryOtpStorage,
  memorySessionStorage,
  memoryCredentialStorage,
  otpTransportConsole,
  sessionHmac,
  registrationHmac,
  sessionTransportMemory,
} from "./index";

describe("makeAuth", () => {
  const otpStorage = memoryOtpStorage();
  const sessionStorage = memorySessionStorage();
  const sessionTransport = sessionTransportMemory();

  const auth = makeAuth({
    session: {
      storage: sessionStorage,
      codec: sessionHmac({ secret: "test", ttl: 10 * 60 * 1000 }),
      transport: sessionTransport,
      ttl: Infinity,
    },
    otp: {
      storage: otpStorage,
      transport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
    },
    passkey: {
      storage: memoryCredentialStorage(),
      registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
      webAuthn: {
        rpId: "localhost",
        rpName: "Test App",
        challengeTtl: 5 * 60 * 1000,
      },
    },
    debug: false,
  });

  it("requestOtp returns success", async () => {
    const result = await auth.requestOtp({ identifier: "test@example.com" });
    expect(result).toStrictEqual({ success: true });
  });

  it("verifyOtp returns success only (no session)", async () => {
    await otpStorage.store({
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
    await sessionStorage.store({
      sessionId: "session_1",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60000),
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 10 * 60 * 1000 });
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

  it("signOut completes without error", async () => {
    await sessionStorage.store({
      sessionId: "session_2",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60000),
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 10 * 60 * 1000 });
    const token = await sessionCodec.encode({
      sessionId: "session_2",
      sessionExp: null,
      userId: "user_1",
    });

    sessionTransport.setToken(token);
    await expect(auth.signOut()).resolves.toBeUndefined();
  });
});

describe("makeAuth sessionTtl", () => {
  it("forever session (null expiresAt) is always valid", async () => {
    const sessionStorage = memorySessionStorage();
    const sessionTransport = sessionTransportMemory();

    const auth = makeAuth({
      session: {
        storage: sessionStorage,
        codec: sessionHmac({ secret: "test", ttl: 50 }),
        transport: sessionTransport,
        ttl: Infinity,
      },
      otp: {
        storage: memoryOtpStorage(),
        transport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
      },
      passkey: {
        storage: memoryCredentialStorage(),
        registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
        webAuthn: {
          rpId: "localhost",
          rpName: "Test App",
          challengeTtl: 5 * 60 * 1000,
        },
      },
      debug: false,
    });

    await sessionStorage.store({
      sessionId: "session_forever",
      userId: "user_1",
      expiresAt: null,
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 50 });
    const token = await sessionCodec.encode({
      sessionId: "session_forever",
      sessionExp: null,
      userId: "user_1",
    });

    // Wait for token to expire
    await new Promise((r) => setTimeout(r, 100));

    sessionTransport.setToken(token);
    const session = await auth.getSession();

    expect(session).toStrictEqual({ userId: "user_1" });
  });

  it("inactivity timeout expires session after TTL", async () => {
    const sessionStorage = memorySessionStorage();
    const sessionTransport = sessionTransportMemory();

    const auth = makeAuth({
      session: {
        storage: sessionStorage,
        codec: sessionHmac({ secret: "test", ttl: 10000 }),
        transport: sessionTransport,
        ttl: 50,
      },
      otp: {
        storage: memoryOtpStorage(),
        transport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
      },
      passkey: {
        storage: memoryCredentialStorage(),
        registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
        webAuthn: {
          rpId: "localhost",
          rpName: "Test App",
          challengeTtl: 5 * 60 * 1000,
        },
      },
      debug: false,
    });

    const sessionExp = new Date(Date.now() + 50);
    await sessionStorage.store({
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

    expect(session).toBeNull();
  });

  it("sliding refresh updates expiresAt on DB fallback", async () => {
    const sessionStorage = memorySessionStorage();
    const sessionTransport = sessionTransportMemory();
    const sessionTtl = 10000;

    const auth = makeAuth({
      session: {
        storage: sessionStorage,
        codec: sessionHmac({ secret: "test", ttl: 50 }),
        transport: sessionTransport,
        ttl: sessionTtl,
      },
      otp: {
        storage: memoryOtpStorage(),
        transport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
      },
      passkey: {
        storage: memoryCredentialStorage(),
        registrationCodec: registrationHmac({ secret: "test", ttl: 300 }),
        webAuthn: {
          rpId: "localhost",
          rpName: "Test App",
          challengeTtl: 5 * 60 * 1000,
        },
      },
      debug: false,
    });

    const sessionExp = new Date(Date.now() + sessionTtl);
    await sessionStorage.store({
      sessionId: "session_sliding",
      userId: "user_1",
      expiresAt: sessionExp,
    });
    const sessionCodec = sessionHmac({ secret: "test", ttl: 50 });
    const token = await sessionCodec.encode({
      sessionId: "session_sliding",
      sessionExp,
      userId: "user_1",
    });

    // Wait for exp to expire but not sessionExp
    await new Promise((r) => setTimeout(r, 100));

    sessionTransport.setToken(token);
    const session = await auth.getSession();

    expect(session).toStrictEqual({ userId: "user_1" });

    // Check that expiresAt was updated (sliding refresh)
    const storedSession = await sessionStorage.get("session_sliding");
    expect(storedSession).not.toBeNull();
    expect(storedSession!.expiresAt).not.toBeNull();
    expect(storedSession!.expiresAt!.getTime()).toBeGreaterThan(
      sessionExp.getTime(),
    );
  });
});
