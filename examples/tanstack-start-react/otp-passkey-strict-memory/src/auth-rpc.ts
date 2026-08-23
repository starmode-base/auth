import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db";
import { auth } from "./auth";
import type {
  RegistrationCredential,
  AuthenticationCredential,
} from "@starmode/auth/client";

/**
 * Request OTP schema
 */
export const requestOtpSchema = z.object({
  identifier: z.email(),
});

/**
 * Verify OTP schema
 */
export const verifyOtpSchema = z.object({
  identifier: z.email(),
  otp: z.string().length(6),
});

/**
 * Send OTP to identifier server function
 *
 * In strict mode, OTP is only allowed for new users. If the email belongs to
 * an existing user who already has passkeys, we reject the request.
 */
export const requestOtp = createServerFn({ method: "POST" })
  .validator(requestOtpSchema)
  .handler(async ({ data }) => {
    const existing = db.users.findByEmail(data.identifier);

    if (existing) {
      const passkeys = await db.credentials.get(existing.userId);
      if (passkeys.length > 0) {
        return { success: false, reason: "passkey-required" as const };
      }
    }

    return auth.requestOtp(data);
  });

/**
 * Verify OTP server function
 *
 * Verifies OTP, upserts user, creates session. In strict mode, rejects
 * sign-in for users who already have passkeys — OTP is only for initial
 * sign-up.
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .validator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const existing = db.users.findByEmail(data.identifier);

    if (existing) {
      const passkeys = await db.credentials.get(existing.userId);
      if (passkeys.length > 0) {
        return { success: false, reason: "passkey-required" as const };
      }
    }

    const result = await auth.verifyOtp(data);

    if (!result.success) return { success: false };

    const { userId, isNew } = db.users.upsert(data.identifier);

    const session = await auth.createSession({ userId });

    if (!session.success) return { success: false };

    return { success: true, isNew };
  });

/**
 * Server function: Start adding a passkey to an authenticated user
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
 * Server function: Verify passkey registration
 *
 * Verifies the credential from the browser ceremony, stores the passkey,
 * and creates a session.
 */
export const verifyRegistration = createServerFn({ method: "POST" })
  .validator(
    z.object({
      registrationToken: z.string(),
      credential: z.any() as z.ZodType<RegistrationCredential>,
    }),
  )
  .handler(async ({ data }) => {
    const result = await auth.verifyRegistration({
      registrationToken: data.registrationToken,
      credential: data.credential,
    });

    if (!result.success) return { success: false as const };

    return { success: true as const };
  });

/**
 * Server function: Start passkey authentication
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
  .validator(verifyAuthenticationSchema)
  .handler(async ({ data }) => {
    const result = await auth.verifyAuthentication({
      credential: data.credential,
    });

    if (!result.success) return { success: false as const };

    return { success: true as const };
  });

/**
 * Server function: List passkeys for the current user
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
 * Server function: Remove a passkey
 *
 * Deletes a passkey for the current user. Refuses to delete the last passkey.
 */
export const removePasskey = createServerFn({ method: "POST" })
  .validator(z.object({ credentialId: z.string() }))
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
 * Server function: Check if an email has passkeys
 *
 * Used by the client to determine whether to show OTP or passkey sign-in.
 */
export const checkHasPasskeys = createServerFn({ method: "POST" })
  .validator(requestOtpSchema)
  .handler(async ({ data }) => {
    const existing = db.users.findByEmail(data.identifier);
    if (!existing) return { hasPasskeys: false };

    const passkeys = await db.credentials.get(existing.userId);
    return { hasPasskeys: passkeys.length > 0 };
  });

/**
 * Server function: Sign out
 *
 * Invalidates the current session and clears the session cookie.
 */
export const signOut = createServerFn({ method: "POST" }).handler(() =>
  auth.signOut(),
);

/**
 * Server function: Sign out all devices
 *
 * Deletes every session for the current user and clears the session cookie.
 */
export const signOutAll = createServerFn({ method: "POST" }).handler(() =>
  auth.signOutAll(),
);

/**
 * Server function: Get viewer
 *
 * Returns the current user if authenticated, or undefined otherwise.
 */
export const getViewer = createServerFn().handler(async () => {
  const session = await auth.getSession();

  return session ? db.users.get(session.userId) : undefined;
});
