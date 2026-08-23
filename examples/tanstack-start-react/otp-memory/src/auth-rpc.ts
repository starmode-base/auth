import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db";
import { auth, emailOtp } from "./auth";
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
 */
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator(requestOtpSchema)
  .handler(({ data }) => auth.strategies.email.request(data));

/**
 * Verify OTP server function
 *
 * Authenticates with the OTP, which upserts the user and establishes a
 * session. Returns isNew to distinguish sign-up from sign-in (for analytics,
 * onboarding, etc.).
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const result = await auth.strategies.email.authenticate(data);

    if (!result.success) return { success: false };

    sessionCookie.set(result.data.session.token, result.data.session.expiresAt);

    return { success: true, isNew: result.data.user.isNew };
  });

/**
 * Change email
 *
 * Verifies OTP for the new email, then swaps it on the authenticated user.
 * Requires an active session — the OTP proves ownership of the new address.
 */
export const changeEmail = createServerFn({ method: "POST" })
  .inputValidator(verifyOtpSchema)
  .handler(async ({ data }) => {
    const identity = await auth.session.get(sessionCookie.get());
    if (!identity) return { success: false };

    const verified = await emailOtp.verify(data.identifier, data.otp);
    if (!verified) return { success: false };

    const user = db.users.updateEmail(identity.userId, data.identifier);
    if (!user) return { success: false };

    return { success: true, viewer: user };
  });

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
