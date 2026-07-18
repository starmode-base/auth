/**
 * Playground — exercises the contracts with no-op adapters.
 * Note every no-op fails closed: a do-nothing auth denies everything.
 */
import { makeAuth } from "./contracts";

export const auth = makeAuth({
  storage: {
    get: async () => null,
    store: async () => undefined,
    delete: async () => undefined,
  },
  codec: {
    encode: async () => "",
    decode: async () => null,
  },
  transport: {
    get: () => null,
    set: () => "",
    clear: () => undefined,
  },
  ttl: 0,
  debug: false,
});

auth.session.create({ userId: "123" });
auth.session.end();

const otpAuth = auth.withOtp({
  storage: {
    verify: async () => false,
    store: async () => undefined,
  },
  delivery: {
    send: async () => undefined,
  },
  ttl: 0,
});

otpAuth.otp.request({ identifier: "test@example.com" });
otpAuth.otp.verify({ identifier: "test@example.com", otp: "123456" });

export const passkey = auth.withPasskey({
  storage: {
    store: async () => undefined,
    get: async () => null,
    list: async () => [],
    setCounter: async () => undefined,
  },
  challengeStorage: {
    store: async () => undefined,
    take: async () => null,
  },
  registrationCodec: {
    encode: async () => "",
    decode: async () => null,
  },
  webAuthn: {
    rpId: "localhost",
    rpName: "Spike",
    allowedOrigins: [],
  },
  challengeTtl: 0,
});

passkey.passkey.createAuthenticationOptions();

// Sign in is two explicit calls — verification never creates sessions:
//   const verified = await auth.passkey.verifyAuthentication({ credential });
//   if (!verified.success) return verified;
//   return auth.session.create({ userId: verified.userId });

export const passkeyAndOtp = passkey.withOtp({
  storage: {
    verify: async () => false,
    store: async () => undefined,
  },
  delivery: {
    send: async () => undefined,
  },
  ttl: 0,
});

passkeyAndOtp.otp.verify({ identifier: "test@example.com", otp: "123456" });
