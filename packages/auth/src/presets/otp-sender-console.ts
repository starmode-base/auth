import type { OtpSender } from "../types";

/**
 * Console OTP send adapter (for development)
 *
 * @param email - The email address to send the OTP to
 * @param otp - The One-Time Password
 */
export const otpSenderConsole: OtpSender = async (email, otp) => {
  console.log(`[OTP] To: ${email} | Your One-Time Password: ${otp}`);
};
