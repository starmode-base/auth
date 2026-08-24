import { getCookie, setCookie } from "@tanstack/react-start/server";

const name = "session";

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/** Moves the session token between the request and the auth API */
export const sessionCookie = {
  get: () => getCookie(name) ?? null,
  set: (token: string, expiresAt: Date) =>
    setCookie(name, token, { ...options, expires: expiresAt }),
  clear: () => setCookie(name, "", { ...options, maxAge: 0 }),
};
