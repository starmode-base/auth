import {
  makeOtpAuth,
  storageMemory,
  sessionHmac,
  otpTransportConsole,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack";

export const auth = makeOtpAuth({
  storage: storageMemory(),
  sessionCodec: sessionHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 600,
  }),
  otpTransport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
  sessionTransport: sessionTransportTanstack(sessionCookieDefaults),
  sessionTtl: Infinity,
  debug: true,
});
