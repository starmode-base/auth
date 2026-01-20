import { makeHmacCodec } from "./hmac-codec";
import type { SessionCodec, SessionPayload, SessionDecoded } from "../types";

type Options = {
  secret: string;
  /** Token TTL in ms (revocation window) */
  ttl: number;
};

// Wire format payload (sessionExp stored as ms timestamp, null = never expires)
type WirePayload = {
  sessionId: string;
  sessionExp: number | null;
  userId: string;
};

/**
 * HMAC-signed session codec
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload includes: { sessionId, sessionExp, userId, exp }
 *
 * - exp: Token expiration, fixed until DB fallback (revocation window)
 * - sessionExp: Slides every request (inactivity timeout), null = never expires
 *
 * Use this when:
 * - You want stateless token validation (no DB lookup for non-expired tokens)
 * - You don't need JWT specifically
 * - You want zero dependencies
 */
export const sessionHmac = (options: Options): SessionCodec => {
  const { secret, ttl } = options;

  const codec = makeHmacCodec<WirePayload>({ secret });

  return {
    ttl,

    encode: async (
      payload: SessionPayload,
      encodeOptions?: { expiresAt?: Date },
    ): Promise<string> => {
      // Convert Date → number for wire format
      const wirePayload: WirePayload = {
        sessionId: payload.sessionId,
        sessionExp: payload.sessionExp?.getTime() ?? null,
        userId: payload.userId,
      };

      // Use provided expiresAt (refresh) or default ttl (new token)
      return encodeOptions?.expiresAt
        ? codec.encode(wirePayload, { expiresAt: encodeOptions.expiresAt })
        : codec.encode(wirePayload, { expiresInMs: ttl });
    },

    decode: async (token: string): Promise<SessionDecoded | null> => {
      const result = await codec.decode(token);
      if (!result) return null;

      // Transform: sessionExp number → Date
      return {
        sessionId: result.sessionId,
        sessionExp:
          result.sessionExp !== null ? new Date(result.sessionExp) : null,
        userId: result.userId,
        exp: result.exp,
        expired: result.expired,
      };
    },
  };
};
