import {
  makeOtpAuth,
  memoryOtpStorage,
  memorySessionStorage,
  sessionHmac,
  sessionTransportCookie,
  sessionCookieDefaults,
  otpTransportConsole,
} from "@starmode/auth";
import type { SessionCookieOptions } from "@starmode/auth";

const otpStorage = memoryOtpStorage();
const sessionStorage = memorySessionStorage();
const codec = sessionHmac({
  secret: "dev-secret-do-not-use-in-production",
  ttl: 600,
});
const otpTransport = otpTransportConsole({ ttl: 10 * 60 * 1000 });

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match && match[1] !== undefined
    ? decodeURIComponent(match[1])
    : undefined;
}

function serializeCookie(
  name: string,
  value: string,
  opts: Omit<SessionCookieOptions, "cookieName">,
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

/**
 * Per-request auth factory
 *
 * Creates an auth instance bound to this request's cookies. Storage, codec,
 * and OTP config are module-level singletons — only the session transport
 * is per-request.
 */
export function makeRequestAuth(req: Request, resHeaders: Headers) {
  return makeOtpAuth({
    session: {
      storage: sessionStorage,
      codec,
      transport: sessionTransportCookie({
        get: (name) => parseCookie(req.headers.get("cookie"), name),
        set: (name, value, opts) =>
          resHeaders.append("Set-Cookie", serializeCookie(name, value, opts)),
        clear: (name, opts) =>
          resHeaders.append(
            "Set-Cookie",
            serializeCookie(name, "", { ...opts, maxAge: 0 }),
          ),
        options: sessionCookieDefaults,
      }),
      ttl: Infinity,
    },
    otp: { storage: otpStorage, transport: otpTransport },
    debug: true,
  });
}
