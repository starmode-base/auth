import { encodePayload, decodePayload, hmacSign, hmacVerify } from "../crypto";

/**
 * Generic HMAC-signed codec for stateless tokens
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload automatically includes exp (unix timestamp)
 */
export function makeHmacCodec<TPayload extends object>(options: {
  secret: string;
  ttl: number; // seconds
}) {
  const { secret, ttl } = options;

  return {
    encode: async (payload: TPayload): Promise<string> => {
      const exp = Math.floor(Date.now() / 1000) + ttl;
      const encoded = encodePayload({ ...payload, exp });
      const signature = await hmacSign(encoded, secret);

      // Invariant: signature must exist for valid HMAC key
      if (!signature) throw new Error("HMAC signing failed");

      return `${encoded}.${signature}`;
    },

    decode: async (
      token: string,
    ): Promise<(TPayload & { valid: boolean; expired: boolean }) | null> => {
      try {
        const [encoded, signature] = token.split(".");
        if (!encoded || !signature) return null;

        // Verify signature (constant-time comparison via Web Crypto)
        const valid = await hmacVerify(encoded, signature, secret);
        if (!valid) return null;

        const data = decodePayload<TPayload & { exp: number }>(encoded);
        if (!data) return null;

        const now = Math.floor(Date.now() / 1000);
        const expired = data.exp < now;

        return { ...data, valid: !expired, expired };
      } catch {
        return null;
      }
    },
  };
}
