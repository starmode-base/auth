import type { SessionTransportAdapter, SessionCookieOptions } from "../types";

/** Default cookie options — export for user reference and spreading */
export const sessionCookieDefaults: SessionCookieOptions = {
  cookieName: "session",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
};

export type SessionTransportCookieConfig = {
  /** Read cookie by name */
  get: (name: string) => string | undefined;
  /** Set cookie with name, value, and options */
  set: (
    name: string,
    value: string,
    options: Omit<SessionCookieOptions, "cookieName">,
  ) => void;
  /** Clear cookie with name and options */
  clear: (
    name: string,
    options: Omit<SessionCookieOptions, "cookieName">,
  ) => void;
  /** Cookie options (use sessionCookieDefaults or spread to override) */
  options: SessionCookieOptions;
};

export const sessionTransportCookie = (
  config: SessionTransportCookieConfig,
): SessionTransportAdapter => {
  const { get, set, clear, options } = config;

  return {
    get: () => get(options.cookieName),
    set: (token) => {
      const { cookieName, ...rest } = options;
      set(cookieName, token, rest);
      return "";
    },
    clear: () => {
      const { cookieName, ...rest } = options;
      clear(cookieName, { ...rest, maxAge: 0 });
    },
  };
};
