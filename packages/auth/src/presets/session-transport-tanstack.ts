import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  sessionTransportCookie,
  sessionCookieDefaults,
} from "./session-transport-cookie";
import type { SessionCookieOptions } from "../types";

export { sessionCookieDefaults };

/**
 * TanStack session transport
 *
 * Wires cookie-based session transport to TanStack's cookie helpers.
 */
export const sessionTransportTanstack = (options: SessionCookieOptions) =>
  sessionTransportCookie({
    get: (name) => getCookie(name),
    set: (name, value, opts) => setCookie(name, value, opts),
    clear: (name, opts) => setCookie(name, "", opts),
    options,
  });
