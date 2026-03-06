"use client";

import { useEffect, useState } from "react";
import {
  requestOtp,
  verifyOtp,
  changeEmail,
  signOut,
  signOutAll,
  getViewer,
} from "./actions";
import { requestOtpSchema, verifyOtpSchema } from "./schema";
import {
  EmailStep,
  OtpStep,
  ChangeEmailStep,
  VerifyEmailStep,
  Toolbar,
} from "@starmode/auth-react";

type Viewer = { userId: string; email: string };

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
        <ChangeEmailStep
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
      <VerifyEmailStep
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

  return (
    <div className="flex flex-col">
      <Toolbar email={props.viewer.email} />

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
              <div className="text-3xl font-semibold">Welcome</div>
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
              <button
                className="rounded-full border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-100"
                onClick={async () => {
                  await signOutAll();
                  props.onSignedOut();
                }}
              >
                Sign out all devices
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
