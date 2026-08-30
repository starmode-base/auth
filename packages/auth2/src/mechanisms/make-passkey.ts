import type { RegistrationContext, WithPasskeyConfig } from "../contracts";
import { base64urlEncode, randomBase64url } from "../lib/crypto";
import {
  parseClientData,
  verifyAuthenticationCredential,
  verifyRegistrationCredential,
} from "../lib/webauthn";

/** Credential record — the shape exchanged with credential storage, not a stored schema */
export type CredentialRecord = {
  credentialId: string;
  userId: string;
  publicKey: Uint8Array;
  /** WebAuthn signature counter (clone detection) */
  counter: number;
  /** null = the client reported no transport hints */
  transports: AuthenticatorTransport[] | null;
};

/** Credential (passkey) storage adapter */
export type CredentialStorage = {
  store: (record: CredentialRecord) => Promise<void>;
  get: (credentialId: string) => Promise<CredentialRecord | null>;
  /** All credentials belonging to the user */
  list: (userId: string) => Promise<CredentialRecord[]>;
  /** Plain overwrite of the WebAuthn signature counter after authentication */
  setCounter: (credentialId: string, counter: number) => Promise<void>;
};

/** WebAuthn challenge record (single-use) */
export type ChallengeRecord = {
  challenge: string;
  /** The registration this challenge authorizes, null for authentication */
  registration: RegistrationContext | null;
  expiresAt: Date;
};

/** Challenge storage adapter. Challenges are single-use. */
export type ChallengeStorage = {
  store: (record: ChallengeRecord) => Promise<void>;
  /** Atomic fetch-and-delete. Unknown challenge returns null. */
  take: (challenge: string) => Promise<ChallengeRecord | null>;
};

/** WebAuthn protocol identity — who the relying party is and which origins may speak for it */
export type WebAuthnConfig = {
  /** Relying party id — the registrable domain passkeys are bound to */
  rpId: string;
  /** Human-readable app name shown by authenticators */
  rpName: string;
  /**
   * Exact allowed origins, scheme + host + port. Matched exactly against
   * clientDataJSON.origin: no wildcards, no subdomain logic, never inferred
   * from rpId.
   */
  allowedOrigins: string[];
};

export type MakePasskeyConfig = {
  storage: CredentialStorage;
  challenge: {
    storage: ChallengeStorage;
    /** Challenge validity duration in ms */
    ttl: number;
  };
  webAuthn: WebAuthnConfig;
  /** Shown in the passkey picker for the registration being started */
  displayName: (context: RegistrationContext) => Promise<string>;
  /**
   * Provisions the application user completing passkey-first sign-up and
   * returns its userId. null disables sign-up; registration then requires
   * current authority.
   */
  signUp: (() => Promise<string>) | null;
  /** Log swallowed verification causes to the console (development aid) */
  debug: boolean;
};

/** Builds the complete trusted passkey strategy from its primitives */
export function makePasskey(config: MakePasskeyConfig): WithPasskeyConfig {
  const policy = {
    rpId: config.webAuthn.rpId,
    allowedOrigins: config.webAuthn.allowedOrigins,
  };

  function swallow(cause: unknown): void {
    if (config.debug) {
      console.error("[passkey] verification failed:", cause);
    }
  }

  async function makeChallenge(
    registration: RegistrationContext | null,
  ): Promise<string> {
    const challenge = randomBase64url(32);

    await config.challenge.storage.store({
      challenge,
      registration,
      expiresAt: new Date(Date.now() + config.challenge.ttl),
    });

    return challenge;
  }

  return {
    createRegistrationOptions: async (context) => {
      if (context.intent === "sign-up" && config.signUp === null) {
        return { success: false, error: "registration_disabled" };
      }

      const name = await config.displayName(context);
      const challenge = await makeChallenge(context);

      const excludeCredentials =
        context.userId === null
          ? []
          : (await config.storage.list(context.userId)).map((credential) => ({
              id: credential.credentialId,
              type: "public-key",
            }));

      const userId =
        context.userId === null
          ? randomBase64url(16)
          : base64urlEncode(new TextEncoder().encode(context.userId));

      return {
        success: true,
        data: {
          challenge,
          rp: {
            id: config.webAuthn.rpId,
            name: config.webAuthn.rpName,
          },
          user: {
            id: userId,
            name,
            displayName: name,
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 60000,
          attestation: "none",
          excludeCredentials,
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "preferred",
          },
        },
      };
    },

    verifyRegistration: async ({ credential }) => {
      const clientData = parseClientData(credential.response.clientDataJSON);
      if (clientData === null) {
        swallow("invalid clientDataJSON");
        return { success: false, error: "verification_failed" };
      }

      const record = await config.challenge.storage.take(clientData.challenge);
      if (record === null || record.expiresAt < new Date()) {
        return { success: false, error: "challenge_expired" };
      }
      if (record.registration === null) {
        swallow("authentication challenge presented for registration");
        return { success: false, error: "verification_failed" };
      }

      let verified;
      try {
        verified = await verifyRegistrationCredential(
          credential,
          record.challenge,
          policy,
        );
      } catch (cause) {
        swallow(cause);
        return { success: false, error: "verification_failed" };
      }

      let userId: string;
      if (record.registration.userId !== null) {
        userId = record.registration.userId;
      } else if (config.signUp === null) {
        return { success: false, error: "registration_disabled" };
      } else {
        userId = await config.signUp();
      }

      await config.storage.store({
        credentialId: verified.credentialId,
        userId,
        publicKey: verified.publicKey,
        counter: verified.counter,
        transports: verified.transports,
      });

      return {
        success: true,
        data: { intent: record.registration.intent, userId },
      };
    },

    createAuthenticationOptions: async () => {
      const challenge = await makeChallenge(null);

      return {
        success: true,
        data: {
          challenge,
          rpId: config.webAuthn.rpId,
          timeout: 60000,
          userVerification: "preferred",
        },
      };
    },

    verifyAuthentication: async ({ credential }) => {
      const stored = await config.storage.get(credential.id);
      if (stored === null) {
        return { success: false, error: "credential_not_found" };
      }

      const clientData = parseClientData(credential.response.clientDataJSON);
      if (clientData === null) {
        swallow("invalid clientDataJSON");
        return { success: false, error: "verification_failed" };
      }

      const record = await config.challenge.storage.take(clientData.challenge);
      if (record === null || record.expiresAt < new Date()) {
        return { success: false, error: "challenge_expired" };
      }
      if (record.registration !== null) {
        swallow("registration challenge presented for authentication");
        return { success: false, error: "verification_failed" };
      }

      let verified;
      try {
        verified = await verifyAuthenticationCredential(
          credential,
          stored,
          record.challenge,
          policy,
        );
      } catch (cause) {
        swallow(cause);
        return { success: false, error: "verification_failed" };
      }

      await config.storage.setCounter(stored.credentialId, verified.counter);

      return { success: true, data: { userId: stored.userId } };
    },
  };
}
