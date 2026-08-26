import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  startRegistration,
  verifyRegistration,
  startAuthentication,
  verifyAuthentication,
  startAddPasskey,
  listPasskeys,
  removePasskey,
  requestOtp,
  addEmail,
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
  AuthLayout,
  PasskeyList,
  Toolbar,
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

type Viewer = { userId: string; email?: string };
type PasskeyEntry = { id: string };

function UnauthenticatedView(props: { onSignedIn: () => void }) {
  const register = usePasskeyRegistration({
    start: () => startRegistration(),
    verify: (credential) => verifyRegistration({ data: { credential } }),
    onSuccess: () => props.onSignedIn(),
  });

  const authenticate = usePasskeyAuthentication({
    start: () => startAuthentication(),
    verify: (credential) => verifyAuthentication({ data: { credential } }),
    onSuccess: () => props.onSignedIn(),
  });

  return (
    <Page>
      <Header title="Welcome!" description="Sign in or create an account." />
      <div className="flex flex-col gap-3">
        <Button onClick={register.submit} disabled={register.loading}>
          Create a passkey
        </Button>
        <Button
          variant="secondary"
          onClick={authenticate.submit}
          disabled={authenticate.loading}
        >
          Sign in with a passkey
        </Button>
      </div>
      {register.error || authenticate.error ? (
        <div className="text-center text-red-500">
          {register.error || authenticate.error}
        </div>
      ) : null}
    </Page>
  );
}

function AddEmailFlow(props: { onSuccess: () => void }) {
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
          title="Add your email"
          description="Optionally link an email address to your account."
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
        const result = await addEmail({
          data: { identifier: email, otp },
        });
        if (result.success) {
          props.onSuccess();
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
        Verify email
      </Button>
    </Page>
  );
}

function Authenticated(props: {
  viewer: Viewer;
  passkeys: PasskeyEntry[];
  onChanged: () => void;
}) {
  const [addingEmail, setAddingEmail] = useState(false);

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

  if (addingEmail) {
    return <AddEmailFlow onSuccess={props.onChanged} />;
  }

  return (
    <Page>
      {props.viewer.email ? (
        <Toolbar email={props.viewer.email} />
      ) : (
        <Header title="Welcome" description={props.viewer.userId} />
      )}

      <PasskeyList
        passkeys={props.passkeys}
        onAdd={addPasskey.submit}
        onRemove={handleRemovePasskey}
        loading={addPasskey.loading}
      />

      {addPasskey.error !== null ? (
        <div className="text-center text-red-500">{addPasskey.error}</div>
      ) : null}

      {!props.viewer.email ? (
        <Button variant="secondary" onClick={() => setAddingEmail(true)}>
          Add email address
        </Button>
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
    <AuthLayout demo="Passkey → OTP demo">
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
