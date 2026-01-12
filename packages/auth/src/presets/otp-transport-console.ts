import type { OtpTransportAdapter } from "../types";

export const otpTransportConsole: OtpTransportAdapter = {
  send: async (identifier, otp) => {
    console.log(`[OTP] ${identifier}: ${otp}`);
  },
};
