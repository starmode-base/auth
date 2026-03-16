"use client";

import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp, signOut, signOutAll } from "./actions";
import {
  Page,
  Button,
  EmailStep,
  OtpStep,
  Toolbar,
  useOtpFlow,
} from "@repo/auth-react";

type Viewer = { userId: string; email: string };

function AuthFlow(props: { onSignedIn: () => void }) {
  const flow = useOtpFlow({
    requestOtp: (id) => requestOtp({ identifier: id }),
    verify: (id, otp) => verifyOtp({ identifier: id, otp }),
    onSuccess: () => props.onSignedIn(),
  });

  return flow.step === "email" ? (
    <EmailStep {...flow.emailStepProps} />
  ) : (
    <OtpStep {...flow.otpStepProps} />
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
