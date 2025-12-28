import type {
  AuthHandler,
  AuthRequest,
  AuthResponse,
  CookieAuthReturn,
  MakeAuthHandler,
} from "./types";

/**
 * Make a handler that routes requests to cookie auth methods.
 * Useful for HTTP endpoints and server actions.
 *
 * @example
 * ```ts
 * const handler = makeAuthHandler(cookieAuth);
 * // handler({ method: "requestOtp", email }) → cookieAuth.requestOtp(email)
 * ```
 */
export const makeAuthHandler: MakeAuthHandler = (
  cookieAuth: CookieAuthReturn,
): AuthHandler => {
  return async (request: AuthRequest): Promise<AuthResponse> => {
    switch (request.method) {
      case "requestOtp":
        return cookieAuth.requestOtp(request.email);

      case "verifyOtp":
        return cookieAuth.verifyOtp(request.email, request.code);

      case "getSession":
        return cookieAuth.getSession();

      case "signOut":
        return cookieAuth.signOut();
    }
  };
};
