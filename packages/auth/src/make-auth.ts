import type {
  MakeAuth,
  MakeAuthConfig,
  MakeAuthResult,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthErrorCode,
} from "./types";
import { base64urlEncode, base64urlDecode } from "./crypto";
import {
  verifyRegistrationCredential,
  verifyAuthenticationCredential,
} from "./webauthn";

/** Generate a random 6-digit OTP */
function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const otp = (array[0]! % 1000000).toString().padStart(6, "0");
  return otp;
}

/** Generate a random session ID */
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a random challenge for WebAuthn */
function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

type ChallengeRecord = {
  challenge: string;
  userId?: string; // Only set for registration
  expiresAt: Date;
};

// Challenge store keyed by challenge value for lookup during verification
const challengeStore = new Map<string, ChallengeRecord>();

export const makeAuth: MakeAuth = (config: MakeAuthConfig): MakeAuthResult => {
  const {
    storage,
    sessionCodec,
    registrationCodec,
    otpTransport,
    webAuthn,
    sessionTransport,
    debug,
  } = config;

  // Result helpers with optional debug logging
  const result = {
    ok: <T extends object>(data: T) => ({ success: true as const, ...data }),

    fail: (error: AuthErrorCode, err?: unknown) => {
      if (debug) console.error(`[auth] ${error}`, err);

      return { success: false as const, error };
    },
  };

  return {
    async requestOtp({ identifier }) {
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

      await storage.otp.store(identifier, code, expiresAt);

      await otpTransport.send(identifier, code);

      return result.ok({});
    },

    async verifyOtp({ identifier, otp }) {
      const valid = await storage.otp.verify(identifier, otp);

      if (!valid) {
        return result.fail("invalid_otp");
      }

      return result.ok({});
    },

    async createRegistrationToken({ userId, identifier }) {
      const token = await registrationCodec.encode({ userId, identifier });
      return { registrationToken: token };
    },

    async validateRegistrationToken({ token }) {
      const decoded = await registrationCodec.decode(token);
      if (!decoded || !decoded.valid) {
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
      if (!decoded || !decoded.valid) {
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
        expiresAt: new Date(Date.now() + CHALLENGE_EXPIRY_MS),
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
      if (!decoded || !decoded.valid) {
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
        await storage.credential.store(userId, {
          id: verified.credentialId,
          publicKey: verified.publicKey,
          counter: verified.counter,
          transports: verified.transports,
        });

        // Clean up challenge
        challengeStore.delete(challenge);

        // Create session
        const sessionId = generateSessionId();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

        await storage.session.store(sessionId, userId, expiresAt);

        const token = await sessionCodec.encode({ sessionId, userId });
        const responseToken = sessionTransport.set(token);

        return result.ok({ session: { token: responseToken, userId } });
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
        expiresAt: new Date(Date.now() + CHALLENGE_EXPIRY_MS),
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

        // Create session
        const sessionId = generateSessionId();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

        await storage.session.store(sessionId, userId, expiresAt);

        const token = await sessionCodec.encode({ sessionId, userId });
        const responseToken = sessionTransport.set(token);

        return result.ok({ session: { token: responseToken, userId } });
      } catch (err) {
        challengeStore.delete(challenge);
        return result.fail("verification_failed", err);
      }
    },

    async getSession() {
      const token = sessionTransport.get();
      if (!token) return null;

      const decoded = await sessionCodec.decode(token);

      if (!decoded || !decoded.valid) {
        return null;
      }

      // If token is expired, validate against storage
      if (decoded.expired) {
        const storedSession = await storage.session.get(decoded.sessionId);

        if (!storedSession || storedSession.expiresAt < new Date()) {
          return null;
        }

        return { userId: storedSession.userId };
      }

      return { userId: decoded.userId };
    },

    async signOut() {
      const token = sessionTransport.get();
      if (token) {
        const decoded = await sessionCodec.decode(token);
        if (decoded) {
          await storage.session.delete(decoded.sessionId);
        }
      }
      sessionTransport.clear();
    },
  };
};
