/**
 * Playground — exercises the contracts with no-op adapters.
 * Note every no-op fails closed: a do-nothing auth denies everything.
 */
import { makeAuth } from "./contracts";

export const auth = makeAuth({
  session: {
    ttl: 0,
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
  },
  debug: false,
});

auth.session.create({ userId: "123" });
auth.session.end();

const otpAuth = auth.withOtp({
  ttl: 0,
  storage: {
    verify: async () => false,
    store: async () => undefined,
  },
  delivery: {
    send: async () => undefined,
  },
});

otpAuth.otp.request({ identifier: "test@example.com" });
otpAuth.otp.verify({ identifier: "test@example.com", otp: "123456" });

export const passkey = auth.withPasskey({
  challenge: {
    ttl: 0,
    storage: {
      store: async () => undefined,
      take: async () => null,
    },
  },
  storage: {
    store: async () => undefined,
    get: async () => null,
    list: async () => [],
    setCounter: async () => undefined,
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
});

passkey.passkey.createAuthenticationOptions();

// Sign in is two explicit calls — verification never creates sessions:
//   const verified = await auth.passkey.verifyAuthentication({ credential });
//   if (!verified.success) return verified;
//   return auth.session.create({ userId: verified.userId });

export const passkeyAndOtp = passkey.withOtp({
  ttl: 0,
  storage: {
    verify: async () => false,
    store: async () => undefined,
  },
  delivery: {
    send: async () => undefined,
  },
});

passkeyAndOtp.otp.verify({ identifier: "test@example.com", otp: "123456" });
