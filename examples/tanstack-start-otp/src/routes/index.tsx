import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "../auth-client";
import { useState } from "react";

export const Route = createFileRoute("/")({ component: App });

function Step(props: {
  onSubmit: (email: string) => void;
  placeholder: string;
  label: string;
  error: string | null;
  title: string;
  description: string;
}) {
  const [value, setValue] = useState("");

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">{props.title}</div>
        <div className="text-gray-500">{props.description}</div>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="email"
          placeholder={props.placeholder}
          className="h-10 border-b border-gray-300 bg-transparent placeholder:text-gray-500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {props.error !== null ? (
          <div className="text-red-500">{props.error}</div>
        ) : null}
      </div>
      <button
        type="submit"
        className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800"
        onClick={() => {
          props.onSubmit(value);
        }}
      >
        {props.label}
      </button>
    </>
  );
}

function RequestOtpStep(props: {
  onSubmit: (email: string) => void;
  error: string | null;
}) {
  return (
    <Step
      onSubmit={props.onSubmit}
      placeholder="Email address"
      label="Send one-time password"
      error={props.error}
      title="Welcome!"
      description="Let's get you signed in."
    />
  );
}

function VerifyOtpStep(props: {
  onSubmit: (otp: string) => void;
  error: string | null;
}) {
  return (
    <Step
      onSubmit={props.onSubmit}
      placeholder="One-time password"
      label="Continue"
      error={props.error}
      title="Check your email"
      description="Enter your one-time password."
    />
  );
}

function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid min-h-dvh gap-4 p-4 text-gray-950 md:grid-cols-2">
      <div className="m-auto flex w-full max-w-sm flex-col gap-8 p-8">
        {email === null ? (
          <RequestOtpStep
            onSubmit={async (email) => {
              const result = await authClient.requestOtp({ identifier: email });

              if (result.success) {
                setEmail(email);
                setError(null);
              } else {
                setError("Failed to send OTP");
              }
            }}
            error={error}
          />
        ) : (
          <VerifyOtpStep
            onSubmit={async (otp) => {
              const result = await authClient.verifyOtp({
                identifier: email,
                otp,
              });

              if (result.success) {
                setEmail(null);
                setError(null);
              } else {
                setError("Invalid OTP");
              }
            }}
            error={error}
          />
        )}
        {/* {error && <div className="text-red-500">{error}</div>} */}
      </div>
      <div className="flex gap-8 rounded-xl bg-pink-500 p-8">
        <div className="m-auto text-center">
          <div className="text-3xl font-bold">STΛR MODΞ</div>
          <p>One-time password demo</p>
        </div>
      </div>
    </div>
  );
}
