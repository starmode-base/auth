import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { usersStore } from "./db";
import { auth } from "./auth";

/**
 * Send OTP to identifier
 */
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator(z.object({ identifier: z.string() }))
  .handler(({ data }) => auth.requestOtp(data));

/**
 * Verify OTP
 *
 * Verifies OTP, upserts user, creates session. Returns isNew to distinguish
 * sign-up from sign-in (for analytics, onboarding, etc.).
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator(z.object({ identifier: z.string(), otp: z.string() }))
  .handler(async ({ data }) => {
    const result = await auth.verifyOtp(data);

    if (!result.success) return { success: false };

    const { userId, isNew } = usersStore.upsert(data.identifier);

    const session = await auth.createSession({ userId });

    if (!session.success) return { success: false };

    return { success: true, isNew };
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
