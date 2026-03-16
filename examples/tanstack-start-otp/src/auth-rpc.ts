import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db";
import { auth } from "./auth";

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
 */
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator(requestOtpSchema)
  .handler(({ data }) => auth.requestOtp(data));

/**
 * Verify OTP server function
 *
 * Verifies OTP, upserts user, creates session. Returns isNew to distinguish
 * sign-up from sign-in (for analytics, onboarding, etc.).
 */

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const result = await auth.verifyOtp(data);

    if (!result.success) return { success: false };

    const { userId, isNew } = db.users.upsert(data.identifier);

    const session = await auth.createSession({ userId });

    if (!session.success) return { success: false };

    return { success: true, isNew };
  });

/**
 * Server function: Change email
 *
 * Verifies OTP for the new email, then swaps it on the authenticated user.
 * Requires an active session — the OTP proves ownership of the new address.
 * Wire to useOtpFlow on the client to enable email changes.
 */
export const changeEmail = createServerFn({ method: "POST" })
  .inputValidator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const session = await auth.getSession();
    if (!session) return { success: false };

    const result = await auth.verifyOtp(data);
    if (!result.success) return { success: false };

    const user = db.users.updateEmail(session.userId, data.identifier);
    if (!user) return { success: false };

    return { success: true, viewer: user };
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
