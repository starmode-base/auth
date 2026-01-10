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
 * - You don't need stateless token validation
 */
export const makeSessionOpaque = (): SessionCodec => {
  return {
    encode: async (payload) => {
      // Token is just the sessionId
      return payload.sessionId;
    },

    decode: async (token) => {
      // We can't decode anything from an opaque token
      // The sessionId IS the token, userId must come from storage lookup
      // Mark as expired to force storage lookup
      return {
        sessionId: token,
        userId: "", // Must be looked up from storage
        valid: true,
        expired: true, // Forces storage lookup
      };
    },
  };
};
