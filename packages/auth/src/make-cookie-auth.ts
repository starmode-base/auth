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
    // =========================================================================
    // OTP (pass-through)
    // =========================================================================

    async requestOtp(email) {
      return auth.requestOtp(email);
    },

    async verifyOtp(email, otp) {
      return auth.verifyOtp(email, otp);
    },

    // =========================================================================
    // Registration token (server-side only)
    // =========================================================================

    async createRegistrationToken(userId, email) {
      return auth.createRegistrationToken(userId, email);
    },

    // =========================================================================
    // Passkey (auto cookie handling)
    // =========================================================================

    async generateRegistrationOptions(registrationToken) {
      return auth.generateRegistrationOptions(registrationToken);
    },

    async verifyRegistration(registrationToken, credential) {
      const result = await auth.verifyRegistration(
        registrationToken,
        credential,
      );

      if (!result.success) {
        return result;
      }

      // Set cookie, but don't expose token to client
      cookie.set(result.session.token);
      return {
        success: true,
        session: { token: "", userId: result.session.userId },
      };
    },

    async generateAuthenticationOptions() {
      return auth.generateAuthenticationOptions();
    },

    async verifyAuthentication(credential) {
      const result = await auth.verifyAuthentication(credential);

      if (!result.valid) {
        return result;
      }

      // Set cookie, but don't expose token to client
      cookie.set(result.session.token);
      return {
        valid: true,
        session: { token: "", userId: result.session.userId },
      };
    },

    // =========================================================================
    // Session
    // =========================================================================

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
