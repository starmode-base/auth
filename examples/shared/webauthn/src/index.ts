import { z } from "zod";
import type {
  PasskeyAuthenticationCredential,
  PasskeyRegistrationCredential,
} from "@starmode/auth2";

/**
 * Zod mirrors of the passkey ceremony input contracts, for validating
 * credentials at the transport boundary. The satisfies checks make the
 * compiler prove each schema parses to the contract type. The schemas declare the
 * full consumed surface and strip everything else.
 */

export const registrationCredentialSchema = z.object({
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
  }),
}) satisfies z.ZodType<PasskeyRegistrationCredential>;

export const authenticationCredentialSchema = z.object({
  id: z.string(),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
  }),
}) satisfies z.ZodType<PasskeyAuthenticationCredential>;
