import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  requestOtp,
  verifyOtp,
  checkHasPasskeys,
  requestRecoveryOtp,
  startRecovery,
  startAddPasskey,
  verifyRegistration,
  startAuthentication,
  verifyAuthentication,
  listPasskeys,
  removePasskey,
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
  PasskeyList,
} from "@repo/shared-react";
import {
  usePasskeyAuthentication,
  usePasskeyRegistration,
} from "../use-passkey";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [viewer, { passkeys }] = await Promise.all([
      getViewer(),
      listPasskeys(),
    ]);
    return { viewer, passkeys };
  },
  component: App,
});

type Viewer = { userId: string; email: string };
type PasskeyEntry = { id: string };

function SignUpFlow(props: { onSignedIn: () => void }) {
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
          setError(null);

          const { hasPasskeys } = await checkHasPasskeys({
            data: { identifier: email },
          });

          if (hasPasskeys) {
            setError("This account uses passkey sign-in. Use your passkey.");
            return;
          }

          const result = await requestOtp({ data: { identifier: email } });
          if (result.success) {
            setStep("otp");
          } else {
            setError("Failed to send one-time password");
          }
        }}
      >
        <Header
          title="Create account"
          description="Enter your email to sign up."
        />
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

function RecoveryFlow(props: { onSignedIn: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recover = usePasskeyRegistration({
    start: () => startRecovery({ data: { identifier: email, otp } }),
    verify: (credential) => verifyRegistration({ data: { credential } }),
    onSuccess: () => props.onSignedIn(),
  });

  if (step === "email") {
    return (
      <Page
        as="form"
        onSubmit={async (e) => {
          e.preventDefault();
          await requestRecoveryOtp({ data: { identifier: email } });
          setStep("otp");
          setError(null);
        }}
      >
        <Header
          title="Recover your account"
          description="Enter your email to receive a one-time password."
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
    <Page>
      <Header
        title="Check your email"
        description="Enter your one-time password, then create a new passkey."
      />
      <OtpInput value={otp} onChange={setOtp} error={error ?? recover.error} />
      <Button
        onClick={recover.submit}
        disabled={
          !verifyOtpSchema.safeParse({ identifier: email, otp }).success ||
          recover.loading
        }
      >
        Create a new passkey
      </Button>
      <Button
        variant="secondary"
        type="button"
        onClick={async () => {
          await requestRecoveryOtp({ data: { identifier: email } });
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

function UnauthenticatedView(props: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"choose" | "signup" | "recover">("choose");

  const authenticate = usePasskeyAuthentication({
    start: () => startAuthentication(),
    verify: (credential) => verifyAuthentication({ data: { credential } }),
    onSuccess: () => props.onSignedIn(),
  });

  if (mode === "signup") {
    return <SignUpFlow onSignedIn={props.onSignedIn} />;
  }

  if (mode === "recover") {
    return (
      <RecoveryFlow
        onSignedIn={props.onSignedIn}
        onCancel={() => setMode("choose")}
      />
    );
  }

  return (
    <Page>
      <Header
        title="Welcome!"
        description="Sign up with email or sign in with your passkey."
      />
      <div className="flex flex-col gap-3">
        <Button onClick={() => setMode("signup")}>Sign up with email</Button>
        <Button
          variant="secondary"
          onClick={authenticate.submit}
          disabled={authenticate.loading}
        >
          Sign in with a passkey
        </Button>
        <Button variant="secondary" onClick={() => setMode("recover")}>
          Lost your passkey?
        </Button>
      </div>
      {authenticate.error ? (
        <div className="text-center text-red-500">{authenticate.error}</div>
      ) : null}
    </Page>
  );
}

function SetupPasskey(props: { viewer: Viewer; onChanged: () => void }) {
  const addPasskey = usePasskeyRegistration({
    start: () => startAddPasskey(),
    verify: (credential) => verifyRegistration({ data: { credential } }),
    onSuccess: () => props.onChanged(),
  });

  return (
    <Page>
      <Header
        title="Set up your passkey"
        description="Add a passkey to secure your account. Future sign-ins will use your passkey only."
      />
      <Button onClick={addPasskey.submit} disabled={addPasskey.loading}>
        Create a passkey
      </Button>
      {addPasskey.error !== null ? (
        <div className="text-center text-red-500">{addPasskey.error}</div>
      ) : null}
      <Button
        variant="secondary"
        onClick={async () => {
          await signOut();
          props.onChanged();
        }}
      >
        Sign out
      </Button>
    </Page>
  );
}

function Authenticated(props: {
  viewer: Viewer;
  passkeys: PasskeyEntry[];
  onChanged: () => void;
}) {
  const addPasskey = usePasskeyRegistration({
    start: () => startAddPasskey(),
    verify: (credential) => verifyRegistration({ data: { credential } }),
    onSuccess: () => props.onChanged(),
  });

  const handleRemovePasskey = async (credentialId: string) => {
    const result = await removePasskey({ data: { credentialId } });
    if (result.success) {
      props.onChanged();
    }
  };

  return (
    <Page>
      <Toolbar email={props.viewer.email} />

      <PasskeyList
        passkeys={props.passkeys}
        onAdd={addPasskey.submit}
        onRemove={handleRemovePasskey}
        loading={addPasskey.loading}
      />

      {addPasskey.error !== null ? (
        <div className="text-center text-red-500">{addPasskey.error}</div>
      ) : null}

      <Button
        onClick={async () => {
          await signOut();
          props.onChanged();
        }}
      >
        Sign out
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          await signOutAll();
          props.onChanged();
        }}
      >
        Sign out all devices
      </Button>
    </Page>
  );
}

function App() {
  const { viewer, passkeys } = Route.useLoaderData();
  const router = useRouter();
  const invalidate = () => router.invalidate();

  if (!viewer) {
    return (
      <AuthLayout demo="OTP → Passkey (strict) demo">
        <UnauthenticatedView onSignedIn={invalidate} />
      </AuthLayout>
    );
  }

  const hasPasskeys = passkeys.length > 0;

  return (
    <AuthLayout demo="OTP → Passkey (strict) demo">
      {hasPasskeys ? (
        <Authenticated
          viewer={viewer as Viewer}
          passkeys={passkeys}
          onChanged={invalidate}
        />
      ) : (
        <SetupPasskey viewer={viewer as Viewer} onChanged={invalidate} />
      )}
    </AuthLayout>
  );
}
