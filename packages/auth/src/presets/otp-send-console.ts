import type { SendOtp } from "../types";

/**
 * Console OTP send adapter (for development)
 *
 * @param email - The email address to send the OTP to
 * @param otp - The One-Time Password
 */
export const otpSendConsole: SendOtp = async (email, otp) => {
  console.log(`[OTP] To: ${email} | Your One-Time Password: ${otp}`);
};
