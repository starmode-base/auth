import { useState } from "react";
import type { StepProps } from "./step";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type UseOtpFlowOptions<T extends { success: boolean } = { success: boolean }> =
  {
    requestOtp: (identifier: string) => Promise<{ success: boolean }>;
    verify: (identifier: string, otp: string) => Promise<T>;
    onSuccess: (result: T) => void;
  };

export function useOtpFlow<T extends { success: boolean }>(
  options: UseOtpFlowOptions<T>,
) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emailStepProps: StepProps = {
    value: email,
    onChange: setEmail,
    valid: EMAIL_REGEX.test(email),
    error,
    onSubmit: async () => {
      const result = await options.requestOtp(email);
      if (result.success) {
        setStep("otp");
        setError(null);
      } else {
        setError("Failed to send one-time password");
      }
    },
  };

  const otpStepProps: StepProps = {
    value: otp,
    onChange: setOtp,
    valid: otp.length === 6,
    error,
    onSubmit: async () => {
      const result = await options.verify(email, otp);
      if (result.success) {
        options.onSuccess(result);
      } else {
        setError("Invalid one-time password");
      }
    },
  };

  const back = () => {
    setStep("email");
    setOtp("");
    setError(null);
  };

  return { step, emailStepProps, otpStepProps, back };
}
