import type { AuthClient } from "../types";

// Re-export types for convenience
export type { AuthClient };
export type {
  RegistrationCredential,
  AuthenticationCredential,
  GenerateRegistrationOptionsReturn,
  VerifyRegistrationReturn,
  GenerateAuthenticationOptionsReturn,
  VerifyAuthenticationReturn,
} from "../types";

/**
 * HTTP client factory — creates a method-based auth client that calls a server endpoint.
 *
 * @example
 * ```ts
 * const auth = httpClient("/api/auth");
 *
 * // Request OTP
 * await auth.requestOtp("user@example.com");
 *
 * // Verify OTP (get registrationToken from server-side signUp flow)
 * const { valid } = await auth.verifyOtp("user@example.com", "123456");
 *
 * // Passkey registration (registrationToken comes from server)
 * const { options } = await auth.generateRegistrationOptions(registrationToken);
 * const credential = await navigator.credentials.create({ publicKey: options });
 * await auth.verifyRegistration(registrationToken, credential);
 *
 * // Passkey sign-in
 * const { options: authOptions } = await auth.generateAuthenticationOptions();
 * const authCred = await navigator.credentials.get({ publicKey: authOptions });
 * await auth.verifyAuthentication(authCred);
 *
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
    // OTP
    requestOtp: (email) => call("requestOtp", { email }),
    verifyOtp: (email, otp) => call("verifyOtp", { email, otp }),

    // Passkey
    generateRegistrationOptions: (registrationToken) =>
      call("generateRegistrationOptions", { registrationToken }),
    verifyRegistration: (registrationToken, credential) =>
      call("verifyRegistration", { registrationToken, credential }),
    generateAuthenticationOptions: () => call("generateAuthenticationOptions"),
    verifyAuthentication: (credential) =>
      call("verifyAuthentication", { credential }),

    // Session
    signOut: () => call("signOut"),
  };
};
