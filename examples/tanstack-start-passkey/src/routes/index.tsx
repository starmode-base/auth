import { createFileRoute } from "@tanstack/react-router";
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
import { createPasskey, getPasskey } from "@starmode/auth/client";
import { AuthLayout, useViewer } from "@starmode/auth-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: App });

type Viewer = { userId: string };
type PasskeyEntry = { id: string };

function UnauthenticatedView(props: { onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setLoading(true);
    setError(null);

    try {
      const start = await startRegistration();

      if (!start.success) {
        setError("Failed to start registration");
        setLoading(false);
        return;
      }

      const credential = await createPasskey(start.options);

      if (!credential) {
        setLoading(false);
        return;
      }

      const result = await verifyRegistration({
        data: {
          registrationToken: start.registrationToken,
          credential,
        },
      });

      if (result.success) {
        props.onSignedIn();
      } else {
        setError("Failed to register passkey");
      }
    } catch {
      setError("Passkey registration failed");
    }

    setLoading(false);
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const { options } = await startAuthentication();

      const credential = await getPasskey(options);

      if (!credential) {
        setLoading(false);
        return;
      }

      const result = await verifyAuthentication({
        data: { credential },
      });

      if (result.success) {
        props.onSignedIn();
      } else {
        setError("Failed to sign in");
      }
    } catch {
      setError("Passkey sign-in failed");
    }

    setLoading(false);
  };

  return (
    <div className="m-auto flex w-full max-w-sm flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">Welcome!</div>
        <div className="text-gray-500">Sign in or create an account.</div>
      </div>
      <div className="flex flex-col gap-3">
        <button
          onClick={handleRegister}
          disabled={loading}
          className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Create a passkey
        </button>
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="rounded-full border border-gray-300 py-3 text-gray-900 hover:bg-gray-100 disabled:opacity-40"
        >
          Sign in with a passkey
        </button>
      </div>
      {error !== null ? (
        <div className="text-center text-red-500">{error}</div>
      ) : null}
    </div>
  );
}

function PasskeyList(props: {
  passkeys: PasskeyEntry[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-gray-500">Passkeys</div>
      <div className="flex flex-col gap-2">
        {props.passkeys.map((passkey, i) => (
          <div
            key={passkey.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
          >
            <span className="text-sm text-gray-700">Passkey {i + 1}</span>
            {props.passkeys.length > 1 ? (
              <button
                className="text-sm text-red-500 hover:text-red-700"
                onClick={() => props.onRemove(passkey.id)}
                disabled={props.loading}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button
        className="rounded-full border border-gray-300 py-2 text-sm text-gray-900 hover:bg-gray-100 disabled:opacity-40"
        onClick={props.onAdd}
        disabled={props.loading}
      >
        Add a passkey
      </button>
    </div>
  );
}

function Authenticated(props: { viewer: Viewer; onSignedOut: () => void }) {
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPasskeys = async () => {
    const result = await listPasskeys();
    setPasskeys(result.passkeys);
  };

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const handleAddPasskey = async () => {
    setLoading(true);
    setError(null);

    try {
      const start = await startAddPasskey();

      if (!start.success) {
        setError("Failed to start passkey registration");
        setLoading(false);
        return;
      }

      const credential = await createPasskey(start.options);

      if (!credential) {
        setLoading(false);
        return;
      }

      const result = await verifyRegistration({
        data: {
          registrationToken: start.registrationToken,
          credential,
        },
      });

      if (result.success) {
        await fetchPasskeys();
      } else {
        setError("Failed to register passkey");
      }
    } catch {
      setError("Passkey registration failed");
    }

    setLoading(false);
  };

  const handleRemovePasskey = async (credentialId: string) => {
    setLoading(true);
    setError(null);

    const result = await removePasskey({ data: { credentialId } });

    if (result.success) {
      await fetchPasskeys();
    } else {
      setError("Failed to remove passkey");
    }

    setLoading(false);
  };

  return (
    <div className="m-auto flex w-full max-w-sm flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">Welcome</div>
        <div className="text-gray-500">{props.viewer.userId}</div>
      </div>

      <PasskeyList
        passkeys={passkeys}
        onAdd={handleAddPasskey}
        onRemove={handleRemovePasskey}
        loading={loading}
      />

      {error !== null ? (
        <div className="text-center text-red-500">{error}</div>
      ) : null}

      <div className="flex gap-2">
        <button
          className="rounded-full bg-gray-900 px-4 py-3 text-white hover:bg-gray-800"
          onClick={async () => {
            await signOut();
            props.onSignedOut();
          }}
        >
          Sign out
        </button>
        <button
          className="rounded-full border border-gray-300 px-4 py-3 text-gray-900 hover:bg-gray-100"
          onClick={async () => {
            await signOutAll();
            props.onSignedOut();
          }}
        >
          Sign out all devices
        </button>
      </div>
    </div>
  );
}

function App() {
  const { viewer, setViewer, loading, fetchViewer } = useViewer(getViewer);

  if (loading) return null;

  return (
    <AuthLayout demo="Passkey demo">
      {viewer ? (
        <Authenticated
          viewer={viewer}
          onSignedOut={() => setViewer(undefined)}
        />
      ) : (
        <UnauthenticatedView onSignedIn={fetchViewer} />
      )}
    </AuthLayout>
  );
}
