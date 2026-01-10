import type {
  MakeAuth,
  MakeAuthConfig,
  MakeAuthReturn,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "./types";

/** Generate a random 6-digit OTP code */
function generateOtpCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0]! % 1000000).toString().padStart(6, "0");
  return code;
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
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Convert Uint8Array to base64url */
function uint8ArrayToBase64url(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Convert base64url to Uint8Array */
function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory challenge store (should use storage adapter in production)
const challengeStore = new Map<
  string,
  { challenge: string; expiresAt: Date }
>();

export const makeAuth: MakeAuth = (config: MakeAuthConfig): MakeAuthReturn => {
  const { storage, session, registration, otp, webauthn } = config;

  return {
    // =========================================================================
    // OTP primitives
    // =========================================================================

    async requestOtp(email: string) {
      const code = generateOtpCode();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

      await storage.otp.store(email, code, expiresAt);

      await otp(email, code);

      return { success: true };
    },

    async verifyOtp(email: string, code: string) {
      const valid = await storage.otp.verify(email, code);
      return { valid };
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
        return { userId: "", email: "", valid: false };
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        valid: true,
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

      // Store challenge for verification
      challengeStore.set(userId, {
        challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
      });

      const options: PublicKeyCredentialCreationOptionsJSON = {
        challenge,
        rp: {
          name: webauthn.rpName,
          id: webauthn.rpId,
        },
        user: {
          id: uint8ArrayToBase64url(new TextEncoder().encode(userId)),
          name: email,
          displayName: email,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        timeout: 60000,
        attestation: "none",
        excludeCredentials: existingCredentials.map((cred) => ({
          id: cred.id,
          type: "public-key" as const,
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
        return { success: false };
      }

      const { userId } = decoded;

      // Get stored challenge
      const storedChallenge = challengeStore.get(userId);
      if (!storedChallenge || storedChallenge.expiresAt < new Date()) {
        challengeStore.delete(userId);
        return { success: false };
      }

      // TODO: Verify the credential response with @simplewebauthn/server
      // For now, we trust the credential and store it
      // In production, use verifyRegistrationResponse from @simplewebauthn/server

      // Parse attestation object to get public key
      // This is a simplified version - real implementation needs CBOR decoding
      const publicKey = base64urlToUint8Array(
        credential.response.attestationObject,
      );

      // Store the credential
      await storage.credential.store(userId, {
        id: credential.id,
        publicKey,
        counter: 0,
        transports: credential.response.transports,
      });

      // Clean up challenge
      challengeStore.delete(userId);

      // Create session
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

      await storage.session.store(sessionId, userId, expiresAt);

      const token = await session.encode({ sessionId, userId });

      return {
        success: true,
        session: { token, userId },
        // TODO: Extract PRF result if extension was used
      };
    },

    async generateAuthenticationOptions() {
      // Generate challenge
      const challenge = generateChallenge();

      // Store challenge for verification (using a temporary key)
      const tempId = generateSessionId();
      challengeStore.set(tempId, {
        challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
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
        return { valid: false };
      }

      const { userId, credential: storedCred } = stored;

      // TODO: Verify the credential response with @simplewebauthn/server
      // For now, we trust the credential
      // In production, use verifyAuthenticationResponse from @simplewebauthn/server

      // Update counter
      await storage.credential.updateCounter(
        credential.id,
        storedCred.counter + 1,
      );

      // Create session
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

      await storage.session.store(sessionId, userId, expiresAt);

      const token = await session.encode({ sessionId, userId });

      return {
        valid: true,
        session: { token, userId },
        // TODO: Extract PRF result if extension was used
      };
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
