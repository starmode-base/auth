import "./index.css";

import {
  requestOtp,
  verifyOtp,
  signOut,
  signOutAll,
  getViewer,
} from "./auth-rpc";
import {
  Page,
  Button,
  EmailStep,
  OtpStep,
  Toolbar,
  AuthLayout,
  useAsync,
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

export function App() {
  const {
    data: viewer,
    setData: setViewer,
    loading,
    refetch,
  } = useAsync<Viewer>(getViewer);

  if (loading) return null;

  return (
    <AuthLayout demo="One-time password demo">
      {viewer ? (
        <Authenticated
          viewer={viewer}
          onSignedOut={() => setViewer(undefined)}
        />
      ) : (
        <AuthFlow onSignedIn={refetch} />
      )}
    </AuthLayout>
  );
}
