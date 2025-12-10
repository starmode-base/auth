// @starmode/auth/client

// ============================================================================
// Types
// ============================================================================

/** Transport adapter — sends method calls to the server */
export type AuthTransportAdapter = (
  method: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

/** HTTP transport factory */
export type HttpTransport = (endpoint: string) => AuthTransportAdapter;

/** Client configuration */
export type MakeAuthClientConfig = {
  transport: AuthTransportAdapter;
};

/** Auth client with typed methods */
export type AuthClient = {
  requestOtp: (args: { email: string }) => Promise<{ success: boolean }>;
  verifyOtp: (args: {
    email: string;
    code: string;
  }) => Promise<{ valid: boolean; userId?: string }>;
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
  return async (method: string, args: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, args }),
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
  return {
    async requestOtp({ email }) {
      const result = await transport("requestOtp", { email });
      return result as { success: boolean };
    },

    async verifyOtp({ email, code }) {
      const result = await transport("verifyOtp", { email, code });
      return result as { valid: boolean; userId?: string };
    },

    async signOut() {
      await transport("deleteSession", {});
    },
  };
};
