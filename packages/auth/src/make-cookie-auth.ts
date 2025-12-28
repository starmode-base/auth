import type {
  CookieAuthReturn,
  MakeCookieAuth,
  MakeCookieAuthConfig,
} from "./types";

/**
 * Wrap auth with automatic cookie handling.
 *
 * @example
 * ```ts
 * const cookieAuth = makeCookieAuth({
 *   auth,
 *   cookie: {
 *     get: () => getCookie("session"),
 *     set: (token) => setCookie("session", token, { httpOnly: true }),
 *     clear: () => deleteCookie("session"),
 *   },
 * });
 * ```
 */
export const makeCookieAuth: MakeCookieAuth = ({
  auth,
  cookie,
}: MakeCookieAuthConfig): CookieAuthReturn => {
  return {
    async requestOtp(email) {
      return auth.requestOtp(email);
    },

    async verifyOtp(email, code) {
      const result = await auth.verifyOtp(email, code);

      if (result.valid && result.token) {
        cookie.set(result.token);
      }

      // Don't expose token to client — cookie is already set
      return { valid: result.valid, userId: result.userId };
    },

    async getSession() {
      const token = cookie.get();
      if (!token) return null;
      return auth.getSession(token);
    },

    async signOut() {
      const token = cookie.get();
      if (token) {
        await auth.deleteSession(token);
      }
      cookie.clear();
    },
  };
};
