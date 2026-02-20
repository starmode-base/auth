import type {
  PasskeyAuthFullConfig,
  PasskeyAuthResult,
  StorageAdapter,
  RegistrationCodec,
  WebAuthnConfig,
  PasskeyMethods,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "./types";
import { base64urlEncode, base64urlDecode } from "./crypto";
import {
  verifyRegistrationCredential,
  verifyAuthenticationCredential,
} from "./webauthn";
import {
  makeCoreAuth,
  type ResultHelpers,
  type StoreSessionFn,
} from "./make-core-auth";

/** Generate a random challenge for WebAuthn */
function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

type ChallengeRecord = {
  challenge: string;
  userId?: string; // Only set for registration
  expiresAt: Date;
};

export function makePasskeyMethods(
  storage: StorageAdapter,
  registrationCodec: RegistrationCodec,
  webAuthn: WebAuthnConfig,
  storeSession: StoreSessionFn,
  result: ResultHelpers,
): PasskeyMethods {
  // Challenge store scoped to this instance
  const challengeStore = new Map<string, ChallengeRecord>();

  return {
    async createRegistrationToken({ userId, identifier }) {
      const token = await registrationCodec.encode({ userId, identifier });
      return { registrationToken: token };
    },

    async validateRegistrationToken({ token }) {
      const decoded = await registrationCodec.decode(token);
      if (!decoded) {
        return result.fail("invalid_token");
      }
      return result.ok({
        userId: decoded.userId,
        identifier: decoded.identifier,
      });
    },

    async generateRegistrationOptions({ registrationToken }) {
      // Validate registration token
      const decoded = await registrationCodec.decode(registrationToken);
      if (!decoded) {
        return result.fail("invalid_token");
      }

      const { userId, identifier } = decoded;

      // Get existing credentials to exclude
      const existingCredentials = await storage.credential.get(userId);

      // Generate challenge
      const challenge = generateChallenge();

      // Store challenge for verification (keyed by challenge for lookup)
      challengeStore.set(challenge, {
        challenge,
        userId,
        expiresAt: new Date(Date.now() + webAuthn.challengeTtl),
      });

      const options: PublicKeyCredentialCreationOptionsJSON = {
        challenge,
        rp: {
          name: webAuthn.rpName,
          id: webAuthn.rpId,
        },
        user: {
          id: base64urlEncode(new TextEncoder().encode(userId)),
          name: identifier,
          displayName: identifier,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
        ],
        timeout: 60000,
        attestation: "none",
        excludeCredentials: existingCredentials.map((cred) => ({
          id: cred.id,
          type: "public-key",
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      };

      return result.ok({ options });
    },

    async verifyRegistration({ registrationToken, credential }) {
      // Validate registration token
      const decoded = await registrationCodec.decode(registrationToken);
      if (!decoded) {
        return result.fail("invalid_token");
      }

      const { userId } = decoded;

      // Find the challenge from the credential's clientDataJSON
      const clientDataBytes = base64urlDecode(
        credential.response.clientDataJSON,
      );
      if (!clientDataBytes) return result.fail("verification_failed");
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
      const challenge = clientData.challenge;

      // Get stored challenge
      const storedChallenge = challengeStore.get(challenge);
      if (!storedChallenge || storedChallenge.expiresAt < new Date()) {
        if (storedChallenge) challengeStore.delete(challenge);
        return result.fail("challenge_expired");
      }

      // Verify userId matches
      if (storedChallenge.userId !== userId) {
        challengeStore.delete(challenge);
        return result.fail("user_mismatch");
      }

      try {
        // Verify the credential
        const verified = await verifyRegistrationCredential(
          credential,
          challenge,
          webAuthn.rpId,
        );

        // Store the credential
        await storage.credential.store({
          userId,
          credential: {
            id: verified.credentialId,
            publicKey: verified.publicKey,
            counter: verified.counter,
            transports: verified.transports,
          },
        });

        // Clean up challenge
        challengeStore.delete(challenge);

        return storeSession(userId);
      } catch (err) {
        challengeStore.delete(challenge);
        return result.fail("verification_failed", err);
      }
    },

    async generateAuthenticationOptions() {
      // Generate challenge
      const challenge = generateChallenge();

      // Store challenge for verification (keyed by challenge for lookup)
      challengeStore.set(challenge, {
        challenge,
        expiresAt: new Date(Date.now() + webAuthn.challengeTtl),
      });

      const options: PublicKeyCredentialRequestOptionsJSON = {
        challenge,
        rpId: webAuthn.rpId,
        timeout: 60000,
        userVerification: "preferred",
        // Empty allowCredentials = discoverable credential (passkey)
      };

      return { options };
    },

    async verifyAuthentication({ credential }) {
      // Look up the credential by ID
      const stored = await storage.credential.getById(credential.id);
      if (!stored) {
        return result.fail("credential_not_found");
      }

      const { userId, credential: storedCred } = stored;

      // Extract challenge from clientDataJSON to look up stored challenge
      const clientDataBytes = base64urlDecode(
        credential.response.clientDataJSON,
      );
      if (!clientDataBytes) return result.fail("verification_failed");
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
      const challenge = clientData.challenge;

      // Get stored challenge
      const storedChallenge = challengeStore.get(challenge);
      if (!storedChallenge || storedChallenge.expiresAt < new Date()) {
        if (storedChallenge) challengeStore.delete(challenge);
        return result.fail("challenge_expired");
      }

      try {
        // Verify the credential
        const verified = await verifyAuthenticationCredential(
          credential,
          storedCred,
          challenge,
          webAuthn.rpId,
        );

        // Update counter
        await storage.credential.updateCounter(credential.id, verified.counter);

        // Clean up challenge
        challengeStore.delete(challenge);

        return storeSession(userId);
      } catch (err) {
        challengeStore.delete(challenge);
        return result.fail("verification_failed", err);
      }
    },
  };
}

export function makePasskeyAuth(
  config: PasskeyAuthFullConfig,
): PasskeyAuthResult {
  const { methods: core, storeSession, result } = makeCoreAuth(config);
  const passkey = makePasskeyMethods(
    config.storage,
    config.registrationCodec,
    config.webAuthn,
    storeSession,
    result,
  );
  return { ...core, ...passkey };
}
