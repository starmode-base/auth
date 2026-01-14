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
  otpTransport: otpTransportConsole,
  webAuthn: {
    rpId: "localhost",
    rpName: "TanStack Start Example",
  },
  sessionTransport: sessionTransportTanstack(sessionCookieDefaults),
  debug: true,
});
