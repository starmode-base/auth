import {
  makeAuth,
  storageMemory,
  sessionHmac,
  registrationHmac,
  otpTransportConsole,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack";

export const auth = makeAuth({
  storage: storageMemory(),
  sessionCodec: sessionHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 600,
  }),
  registrationCodec: registrationHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 300,
  }),
  otpTransport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
  webAuthn: {
    rpId: "localhost",
    rpName: "TanStack Start Example",
    challengeTtl: 5 * 60 * 1000,
  },
  sessionTransport: sessionTransportTanstack(sessionCookieDefaults),
  sessionTtl: Infinity,
  debug: true,
});
