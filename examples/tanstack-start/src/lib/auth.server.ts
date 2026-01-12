import { createServerFn } from "@tanstack/react-start";
import { auth } from "./auth";

/**
 * In-memory user store
 *
 * Simple in-memory user store for demonstration purposes. In a real app this
 * would be replaced with a database. Returns whether the user was newly created
 * so the caller can distinguish sign-up from sign-in.
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
 * Request OTP
 *
 * Sends a one-time password to the given email address. The OTP is valid for a
 * short window and must be verified before the user can proceed.
 */
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((email: string) => email)
  .handler(({ data: email }) => auth.requestOtp(email));

/**
 * Verify OTP
 *
 * Checks whether the provided OTP matches what was sent to the email. Returns
 * success if valid, allowing the client to proceed with sign-up or sign-in.
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; otp: string }) => input)
  .handler(({ data }) => auth.verifyOtp(data.email, data.otp));

/**
 * Sign up
 *
 * Creates a new user account after verifying the OTP. Returns a short-lived
 * registration token that authorizes the client to register a passkey for this
 * user without needing to re-verify email ownership.
 */
export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; otp: string }) => input)
  .handler(async ({ data }) => {
    // Verify OTP
    const result = await auth.verifyOtp(data.email, data.otp);

    if (!result.success) {
      return { success: false, registrationToken: undefined };
    }

    // App upserts user
    const { userId } = upsertUser(data.email);

    // Create registration token for passkey registration
    const { registrationToken } = await auth.createRegistrationToken(
      userId,
      data.email,
    );

    return { success: true, registrationToken };
  });

/**
 * Generate registration options
 *
 * Returns WebAuthn registration options for the browser's credentials API. The
 * registration token ties this request to a verified user without exposing the
 * user ID to the client.
 */
export const generateRegistrationOptions = createServerFn({ method: "POST" })
  .inputValidator((registrationToken: string) => registrationToken)
  .handler(({ data: registrationToken }) =>
    auth.generateRegistrationOptions(registrationToken),
  );

/**
 * Verify registration
 *
 * Validates the credential response from the browser and stores the new passkey.
 * On success, sets a session cookie so the user is immediately signed in.
 */
export const verifyRegistration = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { registrationToken: string; credential: unknown }) => input,
  )
  .handler(({ data }) =>
    auth.verifyRegistration(data.registrationToken, data.credential as never),
  );

/**
 * Generate authentication options
 *
 * Returns WebAuthn authentication options for the browser's credentials API.
 * The challenge is stored server-side and verified when the credential response
 * comes back.
 */
export const generateAuthenticationOptions = createServerFn({
  method: "POST",
}).handler(() => auth.generateAuthenticationOptions());

/**
 * Verify authentication
 *
 * Validates the credential assertion from the browser against a stored passkey.
 * On success, sets a session cookie to establish the authenticated session.
 */
export const verifyAuthentication = createServerFn({ method: "POST" })
  .inputValidator((credential: unknown) => credential)
  .handler(({ data: credential }) =>
    auth.verifyAuthentication(credential as never),
  );

/**
 * Sign out
 *
 * Invalidates the current session and clears the session cookie.
 */
export const signOut = createServerFn({ method: "POST" }).handler(() =>
  auth.signOut(),
);

/**
 * Get session
 *
 * Returns the current session if the user is authenticated, or null otherwise.
 * Used to check auth state on page load and during navigation.
 */
export const getSession = createServerFn({ method: "GET" }).handler(() =>
  auth.getSession(),
);
