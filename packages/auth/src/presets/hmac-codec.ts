import { encodePayload, decodePayload, hmacSign, hmacVerify } from "../crypto";

type HmacCodecOptions = {
  secret: string;
  ttl: number;
};

/**
 * Generic HMAC-signed codec for stateless tokens
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload automatically includes exp (unix timestamp)
 *
 * This is our home-cooked JWT-like codec (but not JWT).
 */
export function makeHmacCodec<TPayload extends object>(
  options: HmacCodecOptions,
) {
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

        const valid = await hmacVerify(encoded, signature, secret);
        if (!valid) return null;

        const data = decodePayload<TPayload & { exp: number }>(encoded);
        if (!data) return null;

        const now = Math.floor(Date.now() / 1000);
        const expired = data.exp < now;
        const { exp, ...payload } = data;

        return { ...(payload as TPayload), valid: !expired, expired };
      } catch {
        return null;
      }
    },
  };
}
