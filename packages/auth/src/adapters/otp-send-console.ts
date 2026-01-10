import type { OtpAdapter } from "../types";

/**
 * Console OTP send adapter (for development)
 *
 * @param email - The email address to send the OTP to
 * @param code - The OTP code
 */
export const otpSendConsole: OtpAdapter = async (email, code) => {
  console.log(`[OTP] To: ${email} | Your code: ${code}`);
};
