"use server";

import { requestOtpSchema, verifyOtpSchema } from "./schema";
import { db } from "./db";
import { getAuth } from "./auth";

/**
 * Send OTP to identifier
 */
export async function requestOtp(data: { identifier: string }) {
  const parsed = requestOtpSchema.safeParse(data);
  if (!parsed.success) return { success: false as const };

  const auth = await getAuth();
  return auth.requestOtp(parsed.data);
}

/**
 * Verify OTP
 *
 * Verifies OTP, upserts user, creates session. Returns isNew to distinguish
 * sign-up from sign-in (for analytics, onboarding, etc.).
 */
export async function verifyOtp(data: { identifier: string; otp: string }) {
  const parsed = verifyOtpSchema.safeParse(data);
  if (!parsed.success) return { success: false as const };

  const auth = await getAuth();
  const result = await auth.verifyOtp(parsed.data);
  if (!result.success) return { success: false as const };

  const { userId, isNew } = db.users.upsert(parsed.data.identifier);

  const session = await auth.createSession({ userId });
  if (!session.success) return { success: false as const };

  return { success: true as const, isNew };
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

  const auth = await getAuth();
  const session = await auth.getSession();
  if (!session) return { success: false as const };

  const result = await auth.verifyOtp(parsed.data);
  if (!result.success) return { success: false as const };

  const user = db.users.updateEmail(session.userId, parsed.data.identifier);
  if (!user) return { success: false as const };

  return { success: true as const, viewer: user };
}

/**
 * Sign out
 *
 * Invalidates the current session and clears the session cookie.
 */
export async function signOut() {
  const auth = await getAuth();
  await auth.signOut();
}

/**
 * Sign out all devices
 *
 * Deletes every session for the current user and clears the session cookie.
 */
export async function signOutAll() {
  const auth = await getAuth();
  await auth.signOutAll();
}

/**
 * Get viewer
 *
 * Returns the current user if authenticated, or undefined otherwise.
 */
export async function getViewer() {
  const auth = await getAuth();
  const session = await auth.getSession();

  return session ? db.users.get(session.userId) : undefined;
}
