import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  requestOtp,
  verifyOtp,
  changeEmail,
  signOut,
  signOutAll,
  getViewer,
  requestOtpSchema,
  verifyOtpSchema,
} from "../auth-rpc";
import {
  Page,
  Button,
  Header,
  EmailInput,
  OtpInput,
  Toolbar,
  AuthLayout,
} from "@repo/auth-react";

export const Route = createFileRoute("/")({
  loader: () => getViewer(),
  component: App,
});

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
          const result = await requestOtp({ data: { identifier: email } });
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
        const result = await verifyOtp({
          data: { identifier: email, otp },
        });
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

function ChangeEmailFlow(props: { onDone: () => void; onCancel: () => void }) {
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
          const result = await requestOtp({ data: { identifier: email } });
          if (result.success) {
            setStep("otp");
            setError(null);
          } else {
            setError("Failed to send one-time password");
          }
        }}
      >
        <Header
          title="Change email"
          description="Enter your new email address."
        />
        <EmailInput value={email} onChange={setEmail} error={error} />
        <Button
          type="submit"
          disabled={!requestOtpSchema.safeParse({ identifier: email }).success}
        >
          Send one-time password
        </Button>
        <Button variant="secondary" type="button" onClick={props.onCancel}>
          Cancel
        </Button>
      </Page>
    );
  }

  return (
    <Page
      as="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await changeEmail({
          data: { identifier: email, otp },
        });
        if (result.success) {
          props.onDone();
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
      <Button variant="secondary" type="button" onClick={props.onCancel}>
        Cancel
      </Button>
    </Page>
  );
}

function Authenticated(props: {
  viewer: Viewer;
  onSignedOut: () => void;
  onEmailChanged: () => void;
}) {
  const [changingEmail, setChangingEmail] = useState(false);

  if (changingEmail) {
    return (
      <ChangeEmailFlow
        onDone={() => {
          setChangingEmail(false);
          props.onEmailChanged();
        }}
        onCancel={() => setChangingEmail(false)}
      />
    );
  }

  return (
    <Page>
      <Toolbar email={props.viewer.email} />
      <Button variant="secondary" onClick={() => setChangingEmail(true)}>
        Change email
      </Button>
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

function App() {
  const viewer = Route.useLoaderData();
  const router = useRouter();

  return (
    <AuthLayout demo="One-time password demo">
      {viewer ? (
        <Authenticated
          viewer={viewer}
          onSignedOut={() => router.invalidate()}
          onEmailChanged={() => router.invalidate()}
        />
      ) : (
        <AuthFlow onSignedIn={() => router.invalidate()} />
      )}
    </AuthLayout>
  );
}
