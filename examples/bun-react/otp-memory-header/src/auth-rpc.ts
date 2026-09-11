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

const TOKEN_KEY = "session-token";

/** The session token lives in localStorage and rides the Authorization header */
const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token === null ? {} : { Authorization: `Bearer ${token}` };
};

/**
 * POST request
 */
const post = async (url: string, data?: unknown) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });

  return res.json();
};

/**
 * GET request
 */
const get = async (url: string) => {
  return await fetch(url, { headers: authHeaders() }).then((res) => res.json());
};

/**
 * Send OTP to identifier
 */
export const requestOtp = (data: z.input<typeof requestOtpSchema>) =>
  post("/api/request-otp", requestOtpSchema.parse(data));

/**
 * Verify OTP
 *
 * Authenticates with the OTP, which upserts the user and establishes a
 * session. The returned token is kept in localStorage. Returns isNew to
 * distinguish sign-up from sign-in (for analytics, onboarding, etc.).
 */
export const verifyOtp = async (data: z.input<typeof verifyOtpSchema>) => {
  const result = await post("/api/verify-otp", verifyOtpSchema.parse(data));

  if (result.success) {
    localStorage.setItem(TOKEN_KEY, result.token);
  }

  return result;
};

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
 * Ends the current session and discards the stored token.
 */
export const signOut = async () => {
  const result = await post("/api/sign-out");
  localStorage.removeItem(TOKEN_KEY);
  return result;
};

/**
 * Sign out all devices
 *
 * Deletes every session for the current user and discards the stored token.
 */
export const signOutAll = async () => {
  const result = await post("/api/sign-out-all");
  localStorage.removeItem(TOKEN_KEY);
  return result;
};

/**
 * Get viewer
 *
 * Returns the current user if authenticated, or null otherwise.
 */
export const getViewer = async () => get("/api/viewer");
