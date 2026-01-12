import { makeHmacCodec } from "./hmac-codec";
import type { RegistrationCodec } from "../types";

type Options = {
  secret: string;
  ttl: number;
};

/**
 * HMAC-signed registration codec
 *
 * Registration tokens are short-lived (e.g., 5 min) and single-purpose:
 * they authorize passkey registration for a specific userId + identifier.
 *
 * Token format: base64url(payload).base64url(signature)
 * Payload includes: userId, identifier, exp (unix timestamp)
 */
export const registrationHmac = (options: Options): RegistrationCodec =>
  makeHmacCodec<{ userId: string; identifier: string }>(options);
