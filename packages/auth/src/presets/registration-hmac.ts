import { encodePayload, decodePayload, hmacSign, hmacVerify } from "../crypto";
import type { RegistrationCodec } from "../types";

type Options = {
  secret: string;
  ttl: number; // seconds
};

type TokenPayload = {
  userId: string;
  email: string;
  exp: number;
};

/**
 * HMAC-signed registration codec
 *
 * Registration tokens are short-lived (e.g., 5 min) and single-purpose:
 * they authorize passkey registration for a specific userId + email.
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload includes: userId, email, exp (unix timestamp)
 */
export const registrationHmac = (options: Options): RegistrationCodec => {
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
          userId: payload.userId,
          email: payload.email,
          valid: !expired,
          expired,
        };
      } catch {
        return null;
      }
    },
  };
};
