import {
  makeOtpAuth,
  memoryOtpStorage,
  memorySessionStorage,
  sessionHmac,
  otpTransportConsole,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack";

export const auth = makeOtpAuth({
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
  debug: true,
});
