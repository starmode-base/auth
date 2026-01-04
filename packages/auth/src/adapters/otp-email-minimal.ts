import type { OtpEmailAdapter } from "../types";

/**
 * Minimal OTP email adapter
 *
 * @param code - The OTP code to send
 * @returns The OTP email content (subject and body)
 */
export const otpEmailMinimal: OtpEmailAdapter = (code) => ({
  subject: "Your code",
  body: code,
});
