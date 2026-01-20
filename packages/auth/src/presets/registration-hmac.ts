import { makeHmacCodec } from "./hmac-codec";
import type { RegistrationCodec, RegistrationPayload } from "../types";

type Options = {
  secret: string;
  /** Token TTL in ms */
  ttl: number;
};

/**
 * HMAC-signed registration codec
 *
 * Registration tokens are short-lived (e.g., 5 min) and single-purpose:
 * they authorize passkey registration for a specific userId + identifier.
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload includes: userId, identifier, exp (expiration timestamp)
 */
export const registrationHmac = (options: Options): RegistrationCodec => {
  const { secret, ttl } = options;
  const codec = makeHmacCodec<RegistrationPayload>({ secret });

  return {
    encode: (payload) => codec.encode(payload, { expiresInMs: ttl }),
    decode: (token) => codec.decode(token),
  };
};
