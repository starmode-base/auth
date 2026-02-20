import { createServerFn } from "@tanstack/react-start";
import { authValidators as validate } from "@starmode/auth";
import { auth } from "./auth";
import { usersStore } from "./db";

/**
 * Continue with email
 *
 * App-specific server function that combines OTP verification with user
 * upsert and session creation. Returns isNew to distinguish sign-up from
 * sign-in (for analytics, onboarding, etc.).
 */
export const continueWithEmail = createServerFn({ method: "POST" })
  .inputValidator(validate.verifyOtp)
  .handler(async ({ data }) => {
    const result = await auth.verifyOtp({
      identifier: data.identifier,
      otp: data.otp,
    });

    if (!result.success) {
      return { success: false as const };
    }

    const { userId, isNew } = usersStore.upsert(data.identifier);

    const session = await auth.createSession({ userId });

    if (!session.success) {
      return { success: false as const };
    }

    return { success: true as const, isNew };
  });

/**
 * Get viewer
 *
 * Returns the current user if authenticated, or null otherwise.
 */
export const getViewer = createServerFn().handler(async () => {
  const session = await auth.getSession();

  if (!session) {
    return null;
  }

  const user = usersStore.get(session.userId);

  if (!user) {
    return null;
  }

  return user;
});
