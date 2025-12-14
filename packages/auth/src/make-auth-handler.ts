import type { AuthHandler, MakeAuthHandler, MakeAuthReturn } from "./types";

/**
 * Make a handler that routes method calls to auth methods.
 * Useful for HTTP endpoints and server actions.
 *
 * @example
 * ```ts
 * const handler = makeAuthHandler(auth);
 * // handler('requestOtp', { email }) → auth.requestOtp(email)
 * ```
 */
export const makeAuthHandler: MakeAuthHandler = (
  auth: MakeAuthReturn,
): AuthHandler => {
  return async (method, args) => {
    switch (method) {
      case "requestOtp": {
        const { email } = args as { email: string };
        return auth.requestOtp(email);
      }

      case "verifyOtp": {
        const { email, code } = args as { email: string; code: string };
        return auth.verifyOtp(email, code);
      }

      case "getSession": {
        const { token } = args as { token: string };
        return auth.getSession(token);
      }

      case "deleteSession": {
        const { token } = args as { token: string };
        return auth.deleteSession(token);
      }

      default:
        throw new Error(`Unknown auth method: ${method}`);
    }
  };
};
