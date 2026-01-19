import type { SessionCodec } from "../types";

/**
 * Opaque session codec
 *
 * Tokens are random strings. All validation requires a database lookup.
 * The token is just the sessionId itself — no encoding needed.
 *
 * Use this when:
 * - You want the simplest possible token format
 * - You're fine with a DB lookup on every request
 * - You want instant revocation (no token expiry window)
 */
export const sessionOpaque = (): SessionCodec => {
  return {
    ttl: 0, // Always hits DB

    encode: async (payload) => {
      // Token is just the sessionId
      return payload.sessionId;
    },

    decode: async (token) => {
      // We can't decode anything from an opaque token
      // The sessionId IS the token, all other fields come from storage lookup
      // Mark as expired to force storage lookup
      return {
        sessionId: token,
        sessionExp: null, // Must be looked up from storage
        userId: "", // Must be looked up from storage
        tokenExp: 0, // Not applicable for opaque
        valid: true,
        expired: true, // Forces storage lookup
      };
    },
  };
};
