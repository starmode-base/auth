import { cookies } from "next/headers";

const name = "session";

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/**
 * Moves the session token between the request and the auth API. cookies() is
 * async and request-scoped; server components may only call get, while set
 * and clear require a Server Action or Route Handler.
 */
export const sessionCookie = {
  get: async () => (await cookies()).get(name)?.value ?? null,
  set: async (token: string, expiresAt: Date) => {
    (await cookies()).set(name, token, { ...options, expires: expiresAt });
  },
  clear: async () => {
    (await cookies()).set(name, "", { ...options, maxAge: 0 });
  },
};
