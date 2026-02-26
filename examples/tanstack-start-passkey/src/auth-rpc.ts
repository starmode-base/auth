import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { usersStore } from "./db";
import { auth } from "./auth";
import type {
  RegistrationCredential,
  AuthenticationCredential,
} from "@starmode/auth/client";

/**
 * Start passkey registration
 *
 * Creates a new user, generates a registration token, and returns WebAuthn
 * registration options for the browser ceremony.
 */
export const startRegistration = createServerFn({ method: "POST" }).handler(
  async () => {
    const { userId } = usersStore.create();

    const { registrationToken } = await auth.createRegistrationToken({
      userId,
      identifier: userId,
    });

    const result = await auth.generateRegistrationOptions({
      registrationToken,
    });

    if (!result.success) return { success: false as const };

    return {
      success: true as const,
      registrationToken,
      options: result.options,
    };
  },
);

/**
 * Verify passkey registration schema
 */
const verifyRegistrationSchema = z.object({
  registrationToken: z.string(),
  credential: z.any() as z.ZodType<RegistrationCredential>,
});

/**
 * Verify passkey registration
 *
 * Verifies the credential from the browser ceremony, stores the passkey,
 * and creates a session.
 */
export const verifyRegistration = createServerFn({ method: "POST" })
  .inputValidator(verifyRegistrationSchema)
  .handler(async ({ data }) => {
    const result = await auth.verifyRegistration({
      registrationToken: data.registrationToken,
      credential: data.credential,
    });

    if (!result.success) return { success: false as const };

    return { success: true as const };
  });

/**
 * Start passkey authentication
 *
 * Generates WebAuthn authentication options for the browser ceremony.
 */
export const startAuthentication = createServerFn({
  method: "POST",
}).handler(async () => {
  const { options } = await auth.generateAuthenticationOptions();
  return { options };
});

/**
 * Verify passkey authentication schema
 */
const verifyAuthenticationSchema = z.object({
  credential: z.any() as z.ZodType<AuthenticationCredential>,
});

/**
 * Verify passkey authentication
 *
 * Verifies the credential assertion from the browser ceremony and creates
 * a session.
 */
export const verifyAuthentication = createServerFn({ method: "POST" })
  .inputValidator(verifyAuthenticationSchema)
  .handler(async ({ data }) => {
    const result = await auth.verifyAuthentication({
      credential: data.credential,
    });

    if (!result.success) return { success: false as const };

    return { success: true as const };
  });

/**
 * Sign out
 *
 * Invalidates the current session and clears the session cookie.
 */
export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await auth.signOut();
});

/**
 * Get viewer
 *
 * Returns the current user if authenticated, or undefined otherwise.
 */
export const getViewer = createServerFn().handler(async () => {
  const session = await auth.getSession();

  return session ? usersStore.get(session.userId) : undefined;
});
