import type { OtpAdapter } from "../types";

/**
 * Console OTP send adapter (for development)
 *
 * @param email - The email address to send the OTP to
 * @param otp - The One-Time Password
 */
export const otpSendConsole: OtpAdapter = async (email, otp) => {
  console.log(`[OTP] To: ${email} | Your One-Time Password: ${otp}`);
};
