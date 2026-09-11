/**
 * Moves the session token between the request and the auth API. Vanilla
 * cookie handling on the bare Request and Headers, no framework helpers.
 */

const NAME = "session";

const ATTRIBUTES = [
  "Path=/",
  "HttpOnly",
  "SameSite=Lax",
  ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
].join("; ");

export const sessionCookie = {
  get: (req: Request): string | null => {
    const header = req.headers.get("cookie");
    if (header === null) return null;

    const match = header.match(new RegExp(`(?:^|;\\s*)${NAME}=([^;]*)`));
    return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
  },

  set: (headers: Headers, token: string, expiresAt: Date) => {
    headers.append(
      "Set-Cookie",
      `${NAME}=${encodeURIComponent(token)}; Expires=${expiresAt.toUTCString()}; ${ATTRIBUTES}`,
    );
  },

  clear: (headers: Headers) => {
    headers.append("Set-Cookie", `${NAME}=; Max-Age=0; ${ATTRIBUTES}`);
  },
};
