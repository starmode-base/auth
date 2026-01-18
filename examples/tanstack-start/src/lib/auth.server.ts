import { createServerFn } from "@tanstack/react-start";
import { authValidators as validate } from "@starmode/auth";
import { auth } from "./auth";

/**
 * In-memory user store
 *
 * Simple in-memory user store for demonstration purposes. In a real app this
 * would be replaced with a database.
 */
const users = new Map<string, { userId: string; email: string }>();
let userIdCounter = 0;

function upsertUser(email: string): { userId: string; isNew: boolean } {
  const existing = Array.from(users.values()).find((u) => u.email === email);
  if (existing) {
    return { userId: existing.userId, isNew: false };
  }
  const userId = `user_${++userIdCounter}`;
  users.set(userId, { userId, email });
  return { userId, isNew: true };
}

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
      return { success: false, registrationToken: undefined };
    }

    const { userId } = upsertUser(data.identifier);
    const { registrationToken } = await auth.createRegistrationToken({
      userId,
      identifier: data.identifier,
    });

    return { success: true, registrationToken };
  });

/**
 * Get session
 *
 * Returns the current session if the user is authenticated, or null otherwise.
 */
export const getSession = createServerFn({ method: "GET" }).handler(() =>
  auth.getSession(),
);
