// @starmode/auth/client

import type { AuthClient } from "../types";

// Re-export the type for convenience
export type { AuthClient };

// ============================================================================
// HTTP client
// ============================================================================

/**
 * HTTP client factory — creates a method-based auth client that calls a server endpoint.
 *
 * Internally uses a discriminated union for dispatch, but the public API is method-based.
 *
 * @example
 * ```ts
 * const auth = httpClient("/api/auth");
 *
 * await auth.requestOtp("user@example.com");
 * const result = await auth.verifyOtp("user@example.com", "123456");
 * await auth.signOut();
 * ```
 */
export const httpClient = (endpoint: string): AuthClient => {
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, ...params }),
    });

    if (!response.ok) {
      throw new Error(
        `Auth request failed: ${response.status} ${response.statusText}`,
      );
    }

    // Handle void responses (signOut returns 204 or empty body)
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };

  return {
    requestOtp: (email) => call("requestOtp", { email }),
    verifyOtp: (email, code) => call("verifyOtp", { email, code }),
    signOut: () => call("signOut"),
  };
};
