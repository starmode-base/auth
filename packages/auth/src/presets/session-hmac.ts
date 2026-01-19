import { encodePayload, decodePayload, hmacSign, hmacVerify } from "../crypto";
import type { SessionCodec, SessionPayload, SessionDecoded } from "../types";

type Options = {
  secret: string;
  /** Token TTL in ms (revocation window) */
  ttl: number;
};

// Token payload (null = never expires)
type TokenPayload = {
  sessionId: string;
  sessionExp: number | null;
  userId: string;
  tokenExp: number;
};

/**
 * HMAC-signed session codec
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload includes: { sessionId, sessionExp, userId, tokenExp }
 *
 * - tokenExp: Fixed until DB fallback (revocation window), in ms
 * - sessionExp: Slides every request (inactivity timeout), null = never expires
 *
 * Use this when:
 * - You want stateless token validation (no DB lookup for non-expired tokens)
 * - You don't need JWT specifically
 * - You want zero dependencies
 */
export const sessionHmac = (options: Options): SessionCodec => {
  const { secret, ttl } = options;

  return {
    ttl,

    encode: async (payload: SessionPayload): Promise<string> => {
      // Use provided tokenExp or generate new (ms timestamp)
      const tokenExp = payload.tokenExp ?? Date.now() + ttl;

      const tokenPayload: TokenPayload = {
        sessionId: payload.sessionId,
        sessionExp: payload.sessionExp,
        userId: payload.userId,
        tokenExp,
      };

      const encoded = encodePayload(tokenPayload);
      const signature = await hmacSign(encoded, secret);

      // Invariant: signature must exist for valid HMAC key
      if (!signature) throw new Error("HMAC signing failed");

      return `${encoded}.${signature}`;
    },

    decode: async (token: string): Promise<SessionDecoded | null> => {
      try {
        const [encoded, signature] = token.split(".");
        if (!encoded || !signature) return null;

        // Verify signature (constant-time comparison via Web Crypto)
        const valid = await hmacVerify(encoded, signature, secret);
        if (!valid) return null;

        const data = decodePayload<TokenPayload>(encoded);
        if (!data) return null;

        const now = Date.now();
        const expired = data.tokenExp < now;

        return {
          sessionId: data.sessionId,
          sessionExp: data.sessionExp,
          userId: data.userId,
          tokenExp: data.tokenExp,
          valid: true,
          expired,
        };
      } catch {
        return null;
      }
    },
  };
};
