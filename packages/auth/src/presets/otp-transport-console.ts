import type { OtpTransportAdapter } from "../types";

export const otpTransportConsole: OtpTransportAdapter = {
  send: async (email, otp) => {
    console.log(`[OTP] ${email}: ${otp}`);
  },
};
