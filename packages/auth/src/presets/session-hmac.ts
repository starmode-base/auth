import { encodePayload, decodePayload, hmacSign, hmacVerify } from "../crypto";
import type { SessionCodec } from "../types";

type Options = {
  secret: string;
  ttl: number; // seconds
};

type TokenPayload = {
  sessionId: string;
  userId: string;
  exp: number;
};

/**
 * HMAC-signed session codec
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload includes: sessionId, userId, exp (unix timestamp)
 *
 * Use this when:
 * - You want stateless token validation (no DB lookup for non-expired tokens)
 * - You don't need JWT specifically
 * - You want zero dependencies
 */
export const sessionHmac = (options: Options): SessionCodec => {
  const { secret, ttl } = options;

  return {
    encode: async (payload) => {
      const exp = Math.floor(Date.now() / 1000) + ttl;
      const data: TokenPayload = { ...payload, exp };
      const encoded = encodePayload(data);
      const signature = await hmacSign(encoded, secret);

      // Invariant: signature must exist for valid HMAC key
      if (!signature) throw new Error("HMAC signing failed");

      return `${encoded}.${signature}`;
    },

    decode: async (token) => {
      try {
        const [encoded, signature] = token.split(".");
        if (!encoded || !signature) return null;

        // Verify signature (constant-time comparison via Web Crypto)
        const valid = await hmacVerify(encoded, signature, secret);
        if (!valid) return null;

        const payload = decodePayload<TokenPayload>(encoded);
        if (!payload) return null;

        const now = Math.floor(Date.now() / 1000);
        const expired = payload.exp < now;

        return {
          sessionId: payload.sessionId,
          userId: payload.userId,
          valid: !expired,
          expired,
        };
      } catch {
        return null;
      }
    },
  };
};
