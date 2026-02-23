import {
  makeAuth,
  memoryOtpStorage,
  memorySessionStorage,
  memoryCredentialStorage,
  sessionHmac,
  registrationHmac,
  otpTransportConsole,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack";

export const auth = makeAuth({
  session: {
    storage: memorySessionStorage(),
    codec: sessionHmac({
      secret: "dev-secret-do-not-use-in-production",
      ttl: 600,
    }),
    transport: sessionTransportTanstack(sessionCookieDefaults),
    ttl: Infinity,
  },
  otp: {
    storage: memoryOtpStorage(),
    transport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
  },
  passkey: {
    storage: memoryCredentialStorage(),
    registrationCodec: registrationHmac({
      secret: "dev-secret-do-not-use-in-production",
      ttl: 300,
    }),
    webAuthn: {
      rpId: "localhost",
      rpName: "TanStack Start Example",
      challengeTtl: 5 * 60 * 1000,
    },
  },
  debug: true,
});
