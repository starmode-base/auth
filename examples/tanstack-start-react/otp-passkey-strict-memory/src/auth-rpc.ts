import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db";
import { auth, hasPasskeys } from "./auth";
import { sessionCookie } from "./session-cookie";

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
 * The strict-mode gate lives in the strategy: for an account with passkeys
 * nothing is sent, and the response does not reveal that.
 */
export const requestOtp = createServerFn({ method: "POST" })
  .validator(requestOtpSchema)
  .handler(({ data }) => auth.strategies.email.request(data));

/**
 * Verify OTP server function
 *
 * Authenticates with the OTP, which upserts the user and establishes a
 * session. In strict mode the strategy rejects accounts that already have
 * passkeys.
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .validator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const result = await auth.strategies.email.authenticate(data);

    if (!result.success) return { success: false };

    sessionCookie.set(result.data.session.token, result.data.session.expiresAt);

    return { success: true, isNew: result.data.user.isNew };
  });

/**
 * Server function: Start adding a passkey to an authenticated user
 *
 * Requires an active session. Returns WebAuthn registration options for the
 * current user.
 */
export const startAddPasskey = createServerFn({ method: "POST" }).handler(
  async () => {
    const result =
      await auth.strategies.passkeys.createAdditionalRegistrationOptions(
        sessionCookie.get(),
      );

    if (!result.success) return { success: false as const };

    return { success: true as const, options: result.data };
  },
);

/**
 * Server function: Verify passkey registration
 *
 * Verifies the credential from the browser ceremony and stores the passkey.
 */
export const verifyRegistration = createServerFn({ method: "POST" })
  .validator(
    z.object({
      credential: z.any() as z.ZodType<RegistrationResponseJSON>,
    }),
  )
  .handler(async ({ data }) => {
    const result = await auth.strategies.passkeys.verifyRegistration(
      sessionCookie.get(),
      { credential: data.credential },
    );

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
  const result = await auth.strategies.passkeys.createAuthenticationOptions();
  return { success: true as const, options: result.data };
});

/**
 * Verify passkey authentication schema
 */
const verifyAuthenticationSchema = z.object({
  credential: z.any() as z.ZodType<AuthenticationResponseJSON>,
});

/**
 * Verify passkey authentication
 *
 * Verifies the credential assertion from the browser ceremony and
 * establishes a session.
 */
export const verifyAuthentication = createServerFn({ method: "POST" })
  .validator(verifyAuthenticationSchema)
  .handler(async ({ data }) => {
    const result = await auth.strategies.passkeys.verifyAuthentication({
      credential: data.credential,
    });

    if (!result.success) return { success: false as const };

    sessionCookie.set(result.data.session.token, result.data.session.expiresAt);

    return { success: true as const };
  });

/**
 * Server function: List passkeys for the current user
 *
 * Returns stored credential metadata for the authenticated user.
 */
export const listPasskeys = createServerFn().handler(async () => {
  const identity = await auth.session.get(sessionCookie.get());
  if (!identity) return { passkeys: [] };

  const passkeys = await db.credentials.list(identity.userId);
  return {
    passkeys: passkeys.map((p) => ({ id: p.credentialId })),
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
    const identity = await auth.session.get(sessionCookie.get());
    if (!identity) return { success: false as const };

    const passkeys = await db.credentials.list(identity.userId);
    if (passkeys.length <= 1) return { success: false as const };

    const owns = passkeys.some((p) => p.credentialId === data.credentialId);
    if (!owns) return { success: false as const };

    db.credentials.delete(data.credentialId);
    return { success: true as const };
  });

/**
 * Server function: Check if an email has passkeys
 *
 * Used by the client to determine whether to show OTP or passkey sign-in.
 * A deliberate app-policy reveal for UX steering.
 */
export const checkHasPasskeys = createServerFn({ method: "POST" })
  .validator(requestOtpSchema)
  .handler(async ({ data }) => ({
    hasPasskeys: await hasPasskeys(data.identifier),
  }));

/**
 * Server function: Sign out
 *
 * Ends the current session and clears the session cookie.
 */
export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await auth.session.end(sessionCookie.get());
  sessionCookie.clear();
});

/**
 * Server function: Sign out all devices
 *
 * Deletes every session for the current user and clears the session cookie.
 */
export const signOutAll = createServerFn({ method: "POST" }).handler(
  async () => {
    const identity = await auth.session.get(sessionCookie.get());
    if (identity) db.sessions.deleteAllForUser(identity.userId);
    sessionCookie.clear();
  },
);

/**
 * Server function: Get viewer
 *
 * Returns the current user if authenticated, or null otherwise.
 */
export const getViewer = createServerFn().handler(async () => {
  const identity = await auth.session.get(sessionCookie.get());

  return identity ? (db.users.get(identity.userId) ?? null) : null;
});
