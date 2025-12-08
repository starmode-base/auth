import type { OtpEmailAdapter } from "../types";

export const otpEmailAdapterMinimal = (): OtpEmailAdapter => {
  return (code) => ({
    subject: "Your code",
    body: code,
  });
};
