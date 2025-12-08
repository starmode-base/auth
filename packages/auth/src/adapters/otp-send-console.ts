import type { OtpSendAdapter } from "../types";

export const otpSendAdapterConsole = (): OtpSendAdapter => {
  return async (email, content) => {
    console.log(`[OTP] To: ${email} | ${content.subject}: ${content.body}`);
  };
};
