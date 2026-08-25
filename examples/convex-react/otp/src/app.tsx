import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { requestOtpSchema, verifyOtpSchema } from "./schemas";
import {
  Page,
  Button,
  Header,
  EmailInput,
  OtpInput,
  Toolbar,
  AuthLayout,
} from "@repo/auth-react";
import { useToken } from "./token";

type Viewer = { userId: string; email: string };

function AuthFlow(props: { onSignedIn: (token: string) => void }) {
  const requestOtp = useMutation(api.auth.requestOtp);
  const verifyOtp = useMutation(api.auth.verifyOtp);

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
          props.onSignedIn(result.token);
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
      <Button
        variant="secondary"
        type="button"
        onClick={async () => {
          await requestOtp({ identifier: email });
          setOtp("");
          setError(null);
        }}
      >
        Send a new one-time password
      </Button>
    </Page>
  );
}

function ChangeEmailFlow(props: {
  token: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const requestOtp = useMutation(api.auth.requestOtp);
  const changeEmail = useMutation(api.auth.changeEmail);

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
          token: props.token,
          identifier: email,
          otp,
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
      <Button
        variant="secondary"
        type="button"
        onClick={async () => {
          await requestOtp({ identifier: email });
          setOtp("");
          setError(null);
        }}
      >
        Send a new one-time password
      </Button>
      <Button variant="secondary" type="button" onClick={props.onCancel}>
        Cancel
      </Button>
    </Page>
  );
}

function Authenticated(props: {
  viewer: Viewer;
  token: string | null;
  onSignedOut: () => void;
}) {
  const signOut = useMutation(api.auth.signOut);
  const signOutAll = useMutation(api.auth.signOutAll);

  const [changingEmail, setChangingEmail] = useState(false);

  if (changingEmail) {
    return (
      <ChangeEmailFlow
        token={props.token}
        onDone={() => setChangingEmail(false)}
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
          await signOut({ token: props.token });
          props.onSignedOut();
        }}
      >
        Sign out
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          await signOutAll({ token: props.token });
          props.onSignedOut();
        }}
      >
        Sign out all devices
      </Button>
    </Page>
  );
}

export function App() {
  const { token, setToken } = useToken();
  const viewer = useQuery(api.auth.getViewer, { token });

  return (
    <AuthLayout demo="Convex OTP demo">
      {viewer === undefined ? null : viewer !== null ? (
        <Authenticated
          viewer={viewer}
          token={token}
          onSignedOut={() => setToken(null)}
        />
      ) : (
        <AuthFlow onSignedIn={setToken} />
      )}
    </AuthLayout>
  );
}
