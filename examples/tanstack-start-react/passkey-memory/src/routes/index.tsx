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
  Header,
  AuthLayout,
  PasskeyList,
} from "@repo/auth-react";
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

type Viewer = { userId: string };
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
      <Header title="Welcome" description={props.viewer.userId} />

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
    <AuthLayout demo="Passkey demo">
      {viewer ? (
        <Authenticated
          viewer={viewer}
          passkeys={passkeys}
          onChanged={() => router.invalidate()}
        />
      ) : (
        <UnauthenticatedView onSignedIn={() => router.invalidate()} />
      )}
    </AuthLayout>
  );
}
