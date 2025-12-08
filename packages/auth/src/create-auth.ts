import type { CreateAuth, CreateAuthConfig, CreateAuthReturn } from "./types";

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

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const createAuth: CreateAuth = (
  config: CreateAuthConfig,
): CreateAuthReturn => {
  const {
    storeOtp,
    verifyOtp,
    upsertUser,
    storeSession,
    getSession,
    deleteSession,
    sessionToken,
    email,
    send,
  } = config;

  return {
    async requestOtp(emailAddress: string) {
      const code = generateOtpCode();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

      await storeOtp(emailAddress, code, expiresAt);

      const content = email(code);
      await send(emailAddress, content);

      return { success: true };
    },

    async verifyOtp(emailAddress: string, code: string) {
      const valid = await verifyOtp(emailAddress, code);

      if (!valid) {
        return { valid: false };
      }

      const { userId } = await upsertUser(emailAddress);

      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

      await storeSession(sessionId, userId, expiresAt);

      const token = sessionToken.encode({ sessionId, userId });

      return { valid: true, userId, token };
    },

    async getSession(token: string) {
      const decoded = sessionToken.decode(token);

      if (!decoded || !decoded.valid) {
        return null;
      }

      // If token is expired, validate against database
      if (decoded.expired) {
        const session = await getSession(decoded.sessionId);

        if (!session || session.expiresAt < new Date()) {
          return null;
        }

        return { userId: session.userId };
      }

      return { userId: decoded.userId };
    },

    async deleteSession(token: string) {
      const decoded = sessionToken.decode(token);

      if (decoded) {
        await deleteSession(decoded.sessionId);
      }
    },
  };
};
