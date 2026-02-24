import { z } from "zod";

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
 * POST request
 */
const post = async (url: string, data?: unknown) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });

  return res.json();
};

/**
 * GET request
 */
const get = async (url: string) => {
  return await fetch(url).then((res) => res.json());
};

/**
 * Send OTP to identifier
 */
export const requestOtp = (data: z.input<typeof requestOtpSchema>) =>
  post("/api/request-otp", requestOtpSchema.parse(data));

/**
 * Verify OTP, upsert user, create session
 *
 * Returns isNew to distinguish sign-up from sign-in (for analytics,
 * onboarding, etc.).
 */
export const verifyOtp = (data: z.input<typeof verifyOtpSchema>) =>
  post("/api/verify-otp", verifyOtpSchema.parse(data));

/**
 * Change email
 *
 * Verifies OTP for the new email, then swaps it on the authenticated user.
 * Requires an active session — the OTP proves ownership of the new address.
 */
export const changeEmail = (data: z.input<typeof verifyOtpSchema>) =>
  post("/api/change-email", verifyOtpSchema.parse(data));

/**
 * Sign out
 *
 * Invalidates the current session and clears the session cookie.
 */
export const signOut = () => post("/api/sign-out");

/**
 * Get viewer
 *
 * Returns the current user if authenticated, or undefined otherwise.
 */
export const getViewer = async () => get("/api/viewer");
