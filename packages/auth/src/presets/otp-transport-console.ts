import type { OtpTransportAdapter } from "../types";

type Options = { ttl: number };

export const otpTransportConsole = (options: Options): OtpTransportAdapter => ({
  ttl: options.ttl,
  send: async (identifier, otp) => {
    console.log(`[OTP] ${identifier}: ${otp}`);
  },
});
