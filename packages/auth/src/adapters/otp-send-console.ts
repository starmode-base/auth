import type { OtpSendAdapter } from "../types";

/**
 * Send OTP to console.
 *
 * @param email - The email address to send the OTP to.
 * @param content - The content of the OTP email.
 * @returns void
 */
export const otpSendAdapterConsole: OtpSendAdapter = async (email, content) => {
  console.log(`[OTP] To: ${email} | ${content.subject}: ${content.body}`);
};
