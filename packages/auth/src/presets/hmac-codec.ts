import { encodePayload, decodePayload, hmacSign, hmacVerify } from "../crypto";

/** Options for HMAC encode - either TTL or absolute expiration */
type HmacEncodeOptions =
  | { expiresInMs: number; expiresAt?: never }
  | { expiresAt: Date; expiresInMs?: never };

/** Convert encode options to expiration timestamp */
export function toExpTimestamp(options: HmacEncodeOptions): number {
  if ("expiresAt" in options && options.expiresAt) {
    return options.expiresAt.getTime();
  }

  return Date.now() + options.expiresInMs;
}

/**
 * Generic HMAC-signed codec for stateless tokens.
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload automatically includes exp (expiration timestamp).
 */
export function makeHmacCodec<TPayload extends object>(options: {
  secret: string;
}) {
  return {
    encode: async (
      payload: TPayload,
      encodeOptions: HmacEncodeOptions,
    ): Promise<string> => {
      const exp = toExpTimestamp(encodeOptions);
      const encoded = encodePayload({ ...payload, exp });
      const signature = await hmacSign(encoded, options.secret);

      // Invariant: signature must exist for valid HMAC key
      if (!signature) throw new Error("HMAC signing failed");

      return `${encoded}.${signature}`;
    },

    /**
     * Decode and verify token.
     * @returns Decoded payload with exp/expired, or null if signature invalid.
     */
    decode: async (
      token: string,
    ): Promise<(TPayload & { exp: Date; expired: boolean }) | null> => {
      try {
        const [encoded, signature] = token.split(".");
        if (!encoded || !signature) return null;

        // Verify signature (constant-time comparison via Web Crypto)
        const valid = await hmacVerify(encoded, signature, options.secret);
        if (!valid) return null;

        const data = decodePayload<TPayload & { exp: number }>(encoded);
        if (!data) return null;

        return {
          ...data,
          exp: new Date(data.exp),
          expired: data.exp < Date.now(),
        };
      } catch {
        return null;
      }
    },
  };
}
