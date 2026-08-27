import { z } from "zod";

/**
 * Zod mirrors of the lib.dom WebAuthn wire shapes, for validating ceremony
 * credentials at the transport boundary. The annotations make the compiler
 * prove each schema parses to the lib.dom type. Only required fields are
 * declared; everything else passes through untouched, so optional and future
 * wire fields are never silently dropped.
 */

const clientExtensionResults =
  z.custom<AuthenticationExtensionsClientOutputsJSON>(
    (value: unknown) => typeof value === "object" && value !== null,
  );

export const registrationResponseSchema: z.ZodType<RegistrationResponseJSON> =
  z.looseObject({
    id: z.string(),
    rawId: z.string(),
    type: z.string(),
    clientExtensionResults,
    response: z.looseObject({
      attestationObject: z.string(),
      authenticatorData: z.string(),
      clientDataJSON: z.string(),
      publicKeyAlgorithm: z.number(),
      transports: z.array(z.string()),
    }),
  });

export const authenticationResponseSchema: z.ZodType<AuthenticationResponseJSON> =
  z.looseObject({
    id: z.string(),
    rawId: z.string(),
    type: z.string(),
    clientExtensionResults,
    response: z.looseObject({
      authenticatorData: z.string(),
      clientDataJSON: z.string(),
      signature: z.string(),
    }),
  });
