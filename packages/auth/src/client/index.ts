import type {
  AuthClient,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationCredential,
  AuthenticationCredential,
} from "../types";
import { base64urlToBuffer, bufferToBase64url } from "../crypto";

// Re-export types for convenience
export type { AuthClient };
export type {
  RegistrationCredential,
  AuthenticationCredential,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  GenerateRegistrationOptionsReturn,
  VerifyRegistrationReturn,
  GenerateAuthenticationOptionsReturn,
  VerifyAuthenticationReturn,
} from "../types";

/**
 * Create a passkey (WebAuthn registration ceremony).
 *
 * Converts JSON options from server to browser API format, triggers the
 * native WebAuthn credential creation dialog, and serializes the result
 * for server transport.
 *
 * Returns null if the user cancels the ceremony.
 */
export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationCredential | null> {
  // Convert JSON options to browser API format
  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id),
    })),
  };

  // Trigger browser WebAuthn ceremony
  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) return null;

  const response = credential.response as AuthenticatorAttestationResponse;

  // Serialize credential for server transport
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      transports: response.getTransports?.() as AuthenticatorTransport[],
    },
    authenticatorAttachment:
      (credential.authenticatorAttachment as AuthenticatorAttachment) ??
      undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

/**
 * Sign in with a passkey (WebAuthn authentication ceremony).
 *
 * Converts JSON options from server to browser API format, triggers the
 * native WebAuthn credential selection dialog, and serializes the result
 * for server transport.
 *
 * Returns null if the user cancels the ceremony.
 */
export async function getPasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationCredential | null> {
  // Convert JSON options to browser API format
  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id),
    })),
  };

  // Trigger browser WebAuthn ceremony
  const credential = (await navigator.credentials.get({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) return null;

  const response = credential.response as AuthenticatorAssertionResponse;

  // Serialize credential for server transport
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : undefined,
    },
    authenticatorAttachment:
      (credential.authenticatorAttachment as AuthenticatorAttachment) ??
      undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

/**
 * HTTP client factory — creates a method-based auth client.
 *
 * Sends JSON-RPC style requests to the given endpoint. Each method is
 * POSTed as `{ method, ...params }`. Pair with `createPasskey`/`getPasskey`
 * to handle the browser-side WebAuthn ceremonies.
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
