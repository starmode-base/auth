import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "../auth-client";
import { useState } from "react";

export const Route = createFileRoute("/")({ component: App });

type Step = "request-otp" | "verify-otp";

function RequestOtpStep(props: { onContinue: (email: string) => void }) {
  const [email, setEmail] = useState("");

  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Welcome!</h1>
        <div className="text-gray-500">Let's get you signed in.</div>
      </div>
      <input
        type="email"
        placeholder="Email address"
        className="h-10 border-b border-gray-300 bg-transparent placeholder:text-gray-500"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        type="submit"
        className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800"
        onClick={() => {
          props.onContinue(email);
        }}
      >
        Send one-time password
      </button>
    </>
  );
}

function VerifyOtpStep(props: { onContinue: (otp: string) => void }) {
  const [otp, setOtp] = useState("");

  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Check your email</h1>
        <div className="text-gray-500">Enter your one-time password.</div>
      </div>
      <input
        type="text"
        placeholder="One-time password"
        className="h-10 border-b border-gray-300 bg-transparent placeholder:text-gray-500"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
      />
      <button
        type="submit"
        className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800"
        onClick={() => {
          props.onContinue(otp);
        }}
      >
        Continue
      </button>
    </>
  );
}

function App() {
  const [step, setStep] = useState<Step>("request-otp");
  const [email, setEmail] = useState("");

  return (
    <div className="grid min-h-dvh grid-cols-2 gap-4 p-4">
      <div className="m-auto flex w-full max-w-sm flex-col gap-8 p-8">
        {step === "request-otp" ? (
          <RequestOtpStep
            onContinue={async (email) => {
              const result = await authClient.requestOtp({ identifier: email });
              if (result.success) {
                setStep("verify-otp");
                setEmail(email);
              } else {
                // setError("Failed to send OTP");
              }
            }}
          />
        ) : step === "verify-otp" ? (
          <VerifyOtpStep
            onContinue={async (otp) => {
              const result = await authClient.verifyOtp({
                identifier: email,
                otp,
              });

              console.log("result", result);
              if (result.success) {
                setStep("request-otp");
              } else {
                // setError("Invalid OTP");
              }
            }}
          />
        ) : null}
      </div>
      <div className="flex gap-8 rounded-xl bg-pink-500 p-8">
        <div className="m-auto text-center">
          <h1 className="text-3xl font-bold">STΛR MODΞ</h1>
          <p>One-time password demo</p>
        </div>
      </div>
    </div>
  );
}
