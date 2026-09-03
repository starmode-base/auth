"use server";

import { requestOtpSchema, verifyOtpSchema } from "./schema";
import { db } from "./db";
import { auth, emailOtp } from "./auth";
import { sessionCookie } from "./session-cookie";

/**
 * Send OTP to identifier
 */
export async function requestOtp(data: { identifier: string }) {
  const parsed = requestOtpSchema.safeParse(data);
  if (!parsed.success) return { success: false as const };

  return auth.strategies.email.request(parsed.data);
}

/**
 * Verify OTP
 *
 * Authenticates with the OTP, which upserts the user and establishes a
 * session. Returns isNew to distinguish sign-up from sign-in (for analytics,
 * onboarding, etc.).
 */
export async function verifyOtp(data: { identifier: string; otp: string }) {
  const parsed = verifyOtpSchema.safeParse(data);
  if (!parsed.success) return { success: false as const };

  const result = await auth.strategies.email.authenticate(parsed.data);
  if (!result.success) return { success: false as const };

  await sessionCookie.set(
    result.data.session.token,
    result.data.session.expiresAt,
  );

  return { success: true as const, isNew: result.data.user.isNew };
}

/**
 * Change email
 *
 * Verifies OTP for the new email, then swaps it on the authenticated user.
 * Requires an active session — the OTP proves ownership of the new address.
 */
export async function changeEmail(data: { identifier: string; otp: string }) {
  const parsed = verifyOtpSchema.safeParse(data);
  if (!parsed.success) return { success: false as const };

  const identity = await auth.session.get(await sessionCookie.get());
  if (!identity) return { success: false as const };

  const verified = await emailOtp.verify(
    parsed.data.identifier,
    parsed.data.otp,
  );
  if (!verified) return { success: false as const };

  const user = db.users.updateEmail(identity.userId, parsed.data.identifier);
  if (!user) return { success: false as const };

  return { success: true as const, viewer: user };
}

/**
 * Sign out
 *
 * Ends the current session and clears the session cookie.
 */
export async function signOut() {
  await auth.session.end(await sessionCookie.get());
  await sessionCookie.clear();
}

/**
 * Sign out all devices
 *
 * Deletes every session for the current user and clears the session cookie.
 */
export async function signOutAll() {
  const identity = await auth.session.get(await sessionCookie.get());
  if (identity) db.sessions.deleteAllForUser(identity.userId);
  await sessionCookie.clear();
}

/**
 * Get viewer
 *
 * Returns the current user if authenticated, or null otherwise. Read-only,
 * safe to call during server component render.
 */
export async function getViewer() {
  const identity = await auth.session.get(await sessionCookie.get());

  return identity ? (db.users.get(identity.userId) ?? null) : null;
}
