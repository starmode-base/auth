"use client";

import { useEffect, useState } from "react";
import {
  requestOtp,
  verifyOtp,
  changeEmail,
  signOut,
  getViewer,
} from "./actions";
import { requestOtpSchema, verifyOtpSchema } from "./schemas";

type Viewer = { userId: string; email: string };

type StepProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  valid: boolean;
  error: string | null;
};

function Step(props: {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  error: string | null;
  valid: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputProps?: React.ComponentProps<"input">;
}) {
  return (
    <form
      className="m-auto flex w-full max-w-sm flex-col gap-8 p-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!props.valid) return;
        props.onSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">{props.title}</div>
        <div className="text-gray-500">{props.description}</div>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder={props.placeholder}
          className="h-10 border-b border-gray-300 bg-transparent placeholder:text-gray-500"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          {...props.inputProps}
        />
        {props.error !== null ? (
          <div className="text-red-500">{props.error}</div>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={!props.valid}
        className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {props.label}
      </button>
    </form>
  );
}

function EmailStep(props: StepProps) {
  return (
    <Step
      title="Welcome!"
      description="Let's get you signed in."
      label="Send one-time password"
      placeholder="Email address"
      inputProps={{
        inputMode: "email",
        autoComplete: "email",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
      }}
      {...props}
    />
  );
}

function OtpStep(props: StepProps) {
  return (
    <Step
      title="Check your email"
      description="Enter your one-time password."
      label="Continue"
      placeholder="One-time password"
      inputProps={{
        inputMode: "numeric",
        autoComplete: "one-time-code",
      }}
      {...props}
    />
  );
}

function AuthFlow(props: { onSignedIn: () => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [emailInput, setEmailInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (step === "email") {
    const valid =
      requestOtpSchema.shape.identifier.safeParse(emailInput).success;

    return (
      <EmailStep
        value={emailInput}
        onChange={setEmailInput}
        valid={valid}
        error={error}
        onSubmit={async () => {
          const result = await requestOtp({ identifier: emailInput });

          if (result.success) {
            setStep("otp");
            setError(null);
          } else {
            setError("Failed to send one-time password");
          }
        }}
      />
    );
  }

  const valid = verifyOtpSchema.shape.otp.safeParse(otpInput).success;

  return (
    <OtpStep
      value={otpInput}
      onChange={setOtpInput}
      valid={valid}
      error={error}
      onSubmit={async () => {
        const result = await verifyOtp({
          identifier: emailInput,
          otp: otpInput,
        });

        if (result.success) {
          props.onSignedIn();
        } else {
          setError("Invalid one-time password");
        }
      }}
    />
  );
}

function ChangeEmailFlow(props: {
  onChanged: (viewer: Viewer) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [emailInput, setEmailInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (step === "email") {
    const valid =
      requestOtpSchema.shape.identifier.safeParse(emailInput).success;

    return (
      <>
        <Step
          title="Change email"
          description="Enter your new email address."
          label="Send one-time password"
          placeholder="New email address"
          inputProps={{
            inputMode: "email",
            autoComplete: "email",
            autoCapitalize: "none",
            autoCorrect: "off",
            spellCheck: false,
          }}
          value={emailInput}
          onChange={setEmailInput}
          valid={valid}
          error={error}
          onSubmit={async () => {
            const result = await requestOtp({ identifier: emailInput });

            if (result.success) {
              setStep("otp");
              setError(null);
            } else {
              setError("Failed to send one-time password");
            }
          }}
        />
        <button
          type="button"
          className="text-gray-500 hover:text-gray-700"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </>
    );
  }

  const valid = verifyOtpSchema.shape.otp.safeParse(otpInput).success;

  return (
    <>
      <Step
        title="Verify new email"
        description="Enter the one-time password sent to your new email."
        label="Change email"
        placeholder="One-time password"
        inputProps={{
          inputMode: "numeric",
          autoComplete: "one-time-code",
        }}
        value={otpInput}
        onChange={setOtpInput}
        valid={valid}
        error={error}
        onSubmit={async () => {
          const result = await changeEmail({
            identifier: emailInput,
            otp: otpInput,
          });

          if (result.success) {
            props.onChanged(result.viewer);
          } else {
            setError("Invalid one-time password");
          }
        }}
      />
      <button
        type="button"
        className="text-gray-500 hover:text-gray-700"
        onClick={props.onCancel}
      >
        Cancel
      </button>
    </>
  );
}

function Authenticated(props: {
  viewer: Viewer;
  onViewerChanged: (viewer: Viewer) => void;
  onSignedOut: () => void;
}) {
  const [changingEmail, setChangingEmail] = useState(false);

  const initials = props.viewer.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-gray-900 text-white">
          {initials}
        </div>
        <div>{props.viewer.email}</div>
      </div>

      <div className="m-auto flex w-full max-w-sm flex-col gap-8">
        {changingEmail ? (
          <ChangeEmailFlow
            onChanged={(viewer) => {
              props.onViewerChanged(viewer);
              setChangingEmail(false);
            }}
            onCancel={() => setChangingEmail(false)}
          />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="text-3xl font-semibold">Welcome {initials}</div>
              <div className="text-gray-500">{props.viewer?.email}</div>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-full bg-gray-900 px-4 py-2 text-white"
                onClick={() => {
                  setChangingEmail(true);
                }}
              >
                Change email
              </button>
              <button
                className="rounded-full bg-gray-900 px-4 py-2 text-white"
                onClick={async () => {
                  await signOut();
                  props.onSignedOut();
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [viewer, setViewer] = useState<Viewer>();
  const [loading, setLoading] = useState(true);

  const fetchViewer = async () => {
    setViewer(await getViewer());
    setLoading(false);
  };

  useEffect(() => {
    fetchViewer();
  }, []);

  if (loading) return null;

  return (
    <div className="grid min-h-dvh gap-4 p-4 text-gray-950 md:grid-cols-2">
      {viewer ? (
        <Authenticated
          viewer={viewer}
          onViewerChanged={setViewer}
          onSignedOut={() => setViewer(undefined)}
        />
      ) : (
        <AuthFlow onSignedIn={fetchViewer} />
      )}
      <div className="flex gap-8 rounded-xl bg-[#F400A1]/25 p-8 text-black">
        <div className="m-auto text-center">
          <div className="text-3xl font-bold">ΛUTH</div>
          <p>One-time password demo</p>
        </div>
      </div>
    </div>
  );
}
