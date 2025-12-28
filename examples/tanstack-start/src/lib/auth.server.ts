import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { makeCookieAuth, makeAuthHandler } from "@starmode/auth";
import type { AuthRequest } from "@starmode/auth";
import { auth } from "./auth";

const SESSION_COOKIE = "session";

const cookieAuth = makeCookieAuth({
  auth,
  cookie: {
    get: () => getCookie(SESSION_COOKIE),
    set: (token) =>
      setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      }),
    clear: () =>
      setCookie(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      }),
  },
});

const handler = makeAuthHandler(cookieAuth);

// Server function for auth actions
export const authAction = createServerFn({ method: "POST" })
  .inputValidator((input: AuthRequest) => input)
  .handler(({ data }) => handler(data));

// Convenience function for loaders
export const getSession = createServerFn({ method: "GET" }).handler(async () =>
  cookieAuth.getSession(),
);
