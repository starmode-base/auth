import {
  makeAuth,
  memoryOtpStorage,
  memorySessionStorage,
  sessionHmac,
  registrationHmac,
  otpTransportConsole,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack";
import { db } from "./db";

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
    storage: db.credentials,
    registrationCodec: registrationHmac({
      secret: "dev-registration-secret",
      ttl: 5 * 60 * 1000,
    }),
    webAuthn: {
      rpId: "localhost",
      rpName: "Auth Passkey → OTP Demo",
      challengeTtl: 5 * 60 * 1000,
    },
  },
  debug: true,
});
