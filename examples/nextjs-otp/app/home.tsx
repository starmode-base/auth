"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp, signOut, signOutAll } from "./actions";
import { requestOtpSchema, verifyOtpSchema } from "./schema";
import {
  Page,
  Button,
  Header,
  EmailInput,
  OtpInput,
  Toolbar,
} from "@repo/auth-react";

type Viewer = { userId: string; email: string };

function AuthFlow(props: { onSignedIn: () => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (step === "email") {
    return (
      <Page
        as="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await requestOtp({ identifier: email });
          if (result.success) {
            setStep("otp");
            setError(null);
          } else {
            setError("Failed to send one-time password");
          }
        }}
      >
        <Header title="Welcome!" description="Let's get you signed in." />
        <EmailInput value={email} onChange={setEmail} error={error} />
        <Button
          type="submit"
          disabled={!requestOtpSchema.safeParse({ identifier: email }).success}
        >
          Send one-time password
        </Button>
      </Page>
    );
  }

  return (
    <Page
      as="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await verifyOtp({ identifier: email, otp });
        if (result.success) {
          props.onSignedIn();
        } else {
          setError("Invalid one-time password");
        }
      }}
    >
      <Header
        title="Check your email"
        description="Enter your one-time password."
      />
      <OtpInput value={otp} onChange={setOtp} error={error} />
      <Button
        type="submit"
        disabled={
          !verifyOtpSchema.safeParse({ identifier: email, otp }).success
        }
      >
        Continue
      </Button>
    </Page>
  );
}

function Authenticated(props: { viewer: Viewer; onSignedOut: () => void }) {
  return (
    <Page>
      <Toolbar email={props.viewer.email} />
      <Button
        onClick={async () => {
          await signOut();
          props.onSignedOut();
        }}
      >
        Sign out
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          await signOutAll();
          props.onSignedOut();
        }}
      >
        Sign out all devices
      </Button>
    </Page>
  );
}

export function HomePage(props: { viewer?: Viewer }) {
  const router = useRouter();

  if (props.viewer) {
    return (
      <Authenticated
        viewer={props.viewer}
        onSignedOut={() => router.refresh()}
      />
    );
  }

  return <AuthFlow onSignedIn={() => router.refresh()} />;
}
