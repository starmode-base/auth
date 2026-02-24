import { cookies } from "next/headers";
import {
  sessionTransportCookie,
  sessionCookieDefaults,
} from "./session-transport-cookie";
import type { SessionCookieOptions, SessionTransportAdapter } from "../types";

export { sessionCookieDefaults };

/**
 * Next.js session transport
 *
 * Returns an async factory that reads `cookies()` per-request and wires
 * cookie-based session transport to Next.js's cookie helpers.
 *
 * Must be called inside a Server Component, Server Action, or Route Handler.
 */
export const sessionTransportNextjs = async (
  options: SessionCookieOptions,
): Promise<SessionTransportAdapter> => {
  const cookieStore = await cookies();

  return sessionTransportCookie({
    get: (name) => cookieStore.get(name)?.value,
    set: (name, value, opts) => cookieStore.set(name, value, opts),
    clear: (name) => cookieStore.delete(name),
    options,
  });
};
