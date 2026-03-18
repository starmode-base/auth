import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  requestOtp,
  verifyOtp,
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
  usePasskeyAuthentication,
  usePasskeyRegistration,
} from "@repo/auth-react";

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

function OtpFlow(props: { onSignedIn: () => void }) {
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
          title="Welcome!"
          description="Enter your email to get started."
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

function UnauthenticatedView(props: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"choose" | "otp">("choose");

  const authenticate = usePasskeyAuthentication({
    start: () => startAuthentication(),
    verify: (args) => verifyAuthentication({ data: args }),
    onSuccess: () => props.onSignedIn(),
  });

  if (mode === "otp") {
    return <OtpFlow onSignedIn={props.onSignedIn} />;
  }

  return (
    <Page>
      <Header
        title="Welcome!"
        description="Sign up with email or sign in with a passkey."
      />
      <div className="flex flex-col gap-3">
        <Button onClick={() => setMode("otp")}>Continue with email</Button>
        <Button
          variant="secondary"
          onClick={authenticate.submit}
          disabled={authenticate.loading}
        >
          Sign in with a passkey
        </Button>
      </div>
      {authenticate.error ? (
        <div className="text-center text-red-500">{authenticate.error}</div>
      ) : null}
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
    verify: (args) => verifyRegistration({ data: args }),
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

  return (
    <AuthLayout demo="OTP → Passkey demo">
      {viewer ? (
        <Authenticated
          viewer={viewer as Viewer}
          passkeys={passkeys}
          onChanged={() => router.invalidate()}
        />
      ) : (
        <UnauthenticatedView onSignedIn={() => router.invalidate()} />
      )}
    </AuthLayout>
  );
}
