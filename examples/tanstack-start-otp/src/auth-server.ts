import { createServerFn } from "@tanstack/react-start";
import { authValidators as validate } from "@starmode/auth";
import { auth } from "./auth";
import { usersStore } from "./db";

/**
 * Sign up
 *
 * App-specific server function that combines OTP verification with user
 * creation. Returns a registration token for passkey registration.
 */
export const signUp = createServerFn({ method: "POST" })
  .inputValidator(validate.verifyOtp)
  .handler(async ({ data }) => {
    const result = await auth.verifyOtp({
      identifier: data.identifier,
      otp: data.otp,
    });

    if (!result.success) {
      return { success: false };
    }

    const { userId } = usersStore.upsert(data.identifier);

    const { registrationToken } = await auth.createRegistrationToken({
      userId,
      identifier: data.identifier,
    });

    return { success: true, registrationToken };
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
