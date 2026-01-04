import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { makeCookieAuth } from "@starmode/auth";
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

// Server functions — export methods directly
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((email: string) => email)
  .handler(({ data: email }) => cookieAuth.requestOtp(email));

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; code: string }) => input)
  .handler(({ data }) => cookieAuth.verifyOtp(data.email, data.code));

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  cookieAuth.signOut(),
);

// Convenience function for loaders
export const getSession = createServerFn({ method: "GET" }).handler(() =>
  cookieAuth.getSession(),
);
