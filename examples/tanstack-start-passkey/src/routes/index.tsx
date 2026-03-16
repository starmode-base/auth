import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  startRegistration,
  verifyRegistration,
  startAuthentication,
  verifyAuthentication,
  startAddPasskey,
  listPasskeys,
  removePasskey,
  signOut,
  signOutAll,
  getViewer,
} from "../auth-rpc";
import {
  Page,
  Button,
  AuthLayout,
  usePasskeyRegistration,
  usePasskeyAuthentication,
  PasskeyList,
} from "@repo/auth-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  loader: () => getViewer(),
  component: App,
});

type Viewer = { userId: string };
type PasskeyEntry = { id: string };

function UnauthenticatedView(props: { onSignedIn: () => void }) {
  const register = usePasskeyRegistration({
    start: () => startRegistration(),
    verify: (args) => verifyRegistration({ data: args }),
    onSuccess: () => props.onSignedIn(),
  });

  const authenticate = usePasskeyAuthentication({
    start: () => startAuthentication(),
    verify: (args) => verifyAuthentication({ data: args }),
    onSuccess: () => props.onSignedIn(),
  });

  return (
    <Page>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">Welcome!</div>
        <div className="text-gray-500">Sign in or create an account.</div>
      </div>
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

function Authenticated(props: { viewer: Viewer; onSignedOut: () => void }) {
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);

  const fetchPasskeys = async () => {
    const result = await listPasskeys();
    setPasskeys(result.passkeys);
  };

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const addPasskey = usePasskeyRegistration({
    start: () => startAddPasskey(),
    verify: (args) => verifyRegistration({ data: args }),
    onSuccess: () => fetchPasskeys(),
  });

  const handleRemovePasskey = async (credentialId: string) => {
    const result = await removePasskey({ data: { credentialId } });
    if (result.success) {
      await fetchPasskeys();
    }
  };

  return (
    <Page>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">Welcome</div>
        <div className="text-gray-500">{props.viewer.userId}</div>
      </div>

      <PasskeyList
        passkeys={passkeys}
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
    <AuthLayout demo="Passkey demo">
      {viewer ? (
        <Authenticated
          viewer={viewer}
          onSignedOut={() => router.invalidate()}
        />
      ) : (
        <UnauthenticatedView onSignedIn={() => router.invalidate()} />
      )}
    </AuthLayout>
  );
}
