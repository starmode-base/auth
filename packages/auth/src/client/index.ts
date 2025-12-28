// @starmode/auth/client

import type {
  AuthRequest,
  AuthResponse,
  RequestOtpResponse,
  VerifyOtpResponse,
} from "../types";

// ============================================================================
// Types
// ============================================================================

/** Transport adapter — sends AuthRequest to server, receives AuthResponse */
export type AuthTransport = (request: AuthRequest) => Promise<AuthResponse>;

/** HTTP transport factory */
export type HttpTransport = (endpoint: string) => AuthTransport;

/** Client configuration */
export type MakeAuthClientConfig = {
  transport: AuthTransport;
};

/** Auth client with typed methods */
export type AuthClient = {
  requestOtp: (args: { email: string }) => Promise<RequestOtpResponse>;
  verifyOtp: (args: {
    email: string;
    code: string;
  }) => Promise<VerifyOtpResponse>;
  signOut: () => Promise<void>;
};

/** Client factory */
export type MakeAuthClient = (config: MakeAuthClientConfig) => AuthClient;

// ============================================================================
// Implementation
// ============================================================================

/**
 * HTTP transport adapter — sends auth requests via fetch.
 *
 * @example
 * ```ts
 * const transport = httpTransport("/api/auth");
 * ```
 */
export const httpTransport: HttpTransport = (endpoint: string) => {
  return async (request: AuthRequest): Promise<AuthResponse> => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Auth request failed: ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  };
};

/**
 * Create an auth client with typed methods.
 *
 * The client wraps the transport, providing type-safe method calls.
 * Type assertions are used internally because the transport returns
 * a union type, but each method knows its expected response type.
 *
 * @example
 * ```ts
 * // HTTP transport
 * const client = makeAuthClient({
 *   transport: httpTransport("/api/auth"),
 * });
 *
 * // Or server action directly
 * const client = makeAuthClient({
 *   transport: authAction,
 * });
 *
 * await client.requestOtp({ email: "user@example.com" });
 * ```
 */
export const makeAuthClient: MakeAuthClient = ({ transport }) => {
  // Helper to call transport with known response type.
  // Safe because handler returns the correct type for each method.
  const call = <T extends AuthResponse>(request: AuthRequest): Promise<T> =>
    transport(request) as Promise<T>;

  return {
    async requestOtp({ email }) {
      return call<RequestOtpResponse>({ method: "requestOtp", email });
    },

    async verifyOtp({ email, code }) {
      return call<VerifyOtpResponse>({ method: "verifyOtp", email, code });
    },

    async signOut() {
      await call<void>({ method: "signOut" });
    },
  };
};
