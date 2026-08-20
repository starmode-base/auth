/** Playground — exercises the contracts with inert adapters */
import { makeAuth } from "./contracts";

export const auth = makeAuth({
  session: {
    create: async () => ({
      accessToken: "",
      refreshToken: null,
    }),
    validate: async () => null,
    refresh: async () => null,
    end: async () => undefined,
  },
  debug: false,
});

const credentials = {
  accessToken: null,
  refreshToken: null,
};

auth.session.create({ userId: "123" });
auth.session.validate({ credentials });
auth.session.refresh({ credentials });
auth.session.end({ credentials });

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
