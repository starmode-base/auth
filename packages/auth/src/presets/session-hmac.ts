import { makeHmacCodec } from "./hmac-codec";
import type { SessionCodec } from "../types";

type Options = {
  secret: string;
  ttl: number;
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
export const sessionHmac = (options: Options): SessionCodec =>
  makeHmacCodec<{ sessionId: string; userId: string }>(options);
