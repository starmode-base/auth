import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db";
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
    const { userId } = db.users.create();

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
 * Start adding a passkey to an authenticated user
 *
 * Requires an active session. Creates a registration token for the current
 * user and returns WebAuthn registration options.
 */
export const startAddPasskey = createServerFn({ method: "POST" }).handler(
  async () => {
    const session = await auth.getSession();
    if (!session) return { success: false as const };

    const { registrationToken } = await auth.createRegistrationToken({
      userId: session.userId,
      identifier: session.userId,
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
 * List passkeys for the current user
 *
 * Returns stored credential metadata for the authenticated user.
 */
export const listPasskeys = createServerFn().handler(async () => {
  const session = await auth.getSession();
  if (!session) return { passkeys: [] };

  const passkeys = await db.credentials.get(session.userId);
  return {
    passkeys: passkeys.map((p) => ({
      id: p.id,
      createdAt: p.id,
    })),
  };
});

/**
 * Remove a passkey
 *
 * Deletes a passkey for the current user. Refuses to delete the last passkey.
 */
export const removePasskey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ credentialId: z.string() }))
  .handler(async ({ data }) => {
    const session = await auth.getSession();
    if (!session) return { success: false as const };

    const passkeys = await db.credentials.get(session.userId);
    if (passkeys.length <= 1) return { success: false as const };

    const owns = passkeys.some((p) => p.id === data.credentialId);
    if (!owns) return { success: false as const };

    await db.credentials.delete(data.credentialId);
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
 * Sign out all devices
 *
 * Deletes every session for the current user and clears the session cookie.
 */
export const signOutAll = createServerFn({ method: "POST" }).handler(
  async () => {
    await auth.signOutAll();
  },
);

/**
 * Get viewer
 *
 * Returns the current user if authenticated, or undefined otherwise.
 */
export const getViewer = createServerFn().handler(async () => {
  const session = await auth.getSession();

  return session ? db.users.get(session.userId) : undefined;
});
