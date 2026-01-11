import type {
  MakeAuth,
  MakeAuthConfig,
  MakeAuthReturn,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
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

export const makeAuth: MakeAuth = (config: MakeAuthConfig): MakeAuthReturn => {
  const { storage, session, registration, sendOtp, webauthn } = config;

  return {
    // =========================================================================
    // OTP primitives
    // =========================================================================

    async requestOtp(email: string) {
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

      await storage.otp.store(email, code, expiresAt);

      await sendOtp(email, code);

      return { success: true };
    },

    async verifyOtp(email: string, otp: string) {
      const valid = await storage.otp.verify(email, otp);

      if (!valid) {
        return { success: false, error: "invalid_otp" };
      }

      return { success: true };
    },

    // =========================================================================
    // Registration token primitives
    // =========================================================================

    async createRegistrationToken(userId: string, email: string) {
      const token = await registration.encode({ userId, email });
      return { registrationToken: token };
    },

    async validateRegistrationToken(token: string) {
      const decoded = await registration.decode(token);

      if (!decoded || !decoded.valid) {
        return { success: false, error: "invalid_token" };
      }

      return {
        success: true,
        userId: decoded.userId,
        email: decoded.email,
      };
    },

    // =========================================================================
    // Passkey primitives
    // =========================================================================

    async generateRegistrationOptions(regToken: string) {
      // Validate registration token
      const decoded = await registration.decode(regToken);

      if (!decoded || !decoded.valid) {
        throw new Error("Invalid or expired registration token");
      }

      const { userId, email } = decoded;

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
          name: webauthn.rpName,
          id: webauthn.rpId,
        },
        user: {
          id: base64urlEncode(new TextEncoder().encode(userId)),
          name: email,
          displayName: email,
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

      return { options };
    },

    async verifyRegistration(regToken: string, credential) {
      // Validate registration token
      const decoded = await registration.decode(regToken);

      if (!decoded || !decoded.valid) {
        return { success: false, error: "invalid_token" };
      }

      const { userId } = decoded;

      // Determine expected origin
      const expectedOrigin = webauthn.origin ?? `https://${webauthn.rpId}`;

      // Find the challenge from the credential's clientDataJSON
      // We need to extract it to look up our stored challenge
      const clientDataBytes = base64urlDecode(
        credential.response.clientDataJSON,
      );
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
      const challenge = clientData.challenge;

      // Get stored challenge
      const storedChallenge = challengeStore.get(challenge);
      if (!storedChallenge || storedChallenge.expiresAt < new Date()) {
        if (storedChallenge) challengeStore.delete(challenge);
        return { success: false, error: "challenge_expired" };
      }

      // Verify userId matches
      if (storedChallenge.userId !== userId) {
        challengeStore.delete(challenge);
        return { success: false, error: "user_mismatch" };
      }

      try {
        // Verify the credential
        const verified = await verifyRegistrationCredential(
          credential,
          challenge,
          expectedOrigin,
          webauthn.rpId,
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

        const token = await session.encode({ sessionId, userId });

        return { success: true, session: { token, userId } };
      } catch {
        challengeStore.delete(challenge);
        return { success: false, error: "verification_failed" };
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
        rpId: webauthn.rpId,
        timeout: 60000,
        userVerification: "preferred",
        // Empty allowCredentials = discoverable credential (passkey)
      };

      return { options };
    },

    async verifyAuthentication(credential) {
      // Look up the credential by ID
      const stored = await storage.credential.getById(credential.id);

      if (!stored) {
        return { success: false, error: "credential_not_found" };
      }

      const { userId, credential: storedCred } = stored;

      // Determine expected origin
      const expectedOrigin = webauthn.origin ?? `https://${webauthn.rpId}`;

      // Extract challenge from clientDataJSON to look up stored challenge
      const clientDataBytes = base64urlDecode(
        credential.response.clientDataJSON,
      );
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
      const challenge = clientData.challenge;

      // Get stored challenge
      const storedChallenge = challengeStore.get(challenge);
      if (!storedChallenge || storedChallenge.expiresAt < new Date()) {
        if (storedChallenge) challengeStore.delete(challenge);
        return { success: false, error: "challenge_expired" };
      }

      try {
        // Verify the credential
        const verified = await verifyAuthenticationCredential(
          credential,
          storedCred,
          challenge,
          expectedOrigin,
          webauthn.rpId,
        );

        // Update counter
        await storage.credential.updateCounter(credential.id, verified.counter);

        // Clean up challenge
        challengeStore.delete(challenge);

        // Create session
        const sessionId = generateSessionId();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

        await storage.session.store(sessionId, userId, expiresAt);

        const token = await session.encode({ sessionId, userId });

        return { success: true, session: { token, userId } };
      } catch {
        challengeStore.delete(challenge);
        return { success: false, error: "verification_failed" };
      }
    },

    // =========================================================================
    // Session primitives
    // =========================================================================

    async getSession(token: string) {
      const decoded = await session.decode(token);

      if (!decoded || !decoded.valid) {
        return null;
      }

      // If token is expired, validate against storage
      if (decoded.expired) {
        const session = await storage.session.get(decoded.sessionId);

        if (!session || session.expiresAt < new Date()) {
          return null;
        }

        return { userId: session.userId };
      }

      return { userId: decoded.userId };
    },

    async deleteSession(token: string) {
      const decoded = await session.decode(token);

      if (decoded) {
        await storage.session.delete(decoded.sessionId);
      }
    },
  };
};
