import {
  makeOtpAuth,
  memoryOtpStorage,
  memorySessionStorage,
  sessionHmac,
  otpTransportConsole,
} from "@starmode/auth";
import {
  sessionTransportNextjs,
  sessionCookieDefaults,
} from "@starmode/auth/nextjs";

const sessionStorage = memorySessionStorage();
const otpStorage = memoryOtpStorage();
const codec = sessionHmac({
  secret: "dev-secret-do-not-use-in-production",
  ttl: 600,
});
const otpTransport = otpTransportConsole({ ttl: 10 * 60 * 1000 });

/**
 * Per-request auth instance.
 *
 * Next.js `cookies()` is async and request-scoped, so the transport must be
 * created inside a Server Action / Route Handler. Storages and codec are
 * module-level singletons — only the transport varies per request.
 */
export async function getAuth() {
  return makeOtpAuth({
    session: {
      storage: sessionStorage,
      codec,
      transport: await sessionTransportNextjs(sessionCookieDefaults),
      ttl: Infinity,
    },
    otp: {
      storage: otpStorage,
      transport: otpTransport,
    },
    debug: true,
  });
}
