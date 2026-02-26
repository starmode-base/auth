import { createFileRoute } from "@tanstack/react-router";
import {
  startRegistration,
  verifyRegistration,
  startAuthentication,
  verifyAuthentication,
  signOut,
  getViewer,
} from "../auth-rpc";
import { createPasskey, getPasskey } from "@starmode/auth/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: App });

type Viewer = { userId: string };

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

function Authenticated(props: { viewer: Viewer; onSignedOut: () => void }) {
  return (
    <div className="m-auto flex w-full max-w-sm flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">Welcome</div>
        <div className="text-gray-500">{props.viewer.userId}</div>
      </div>
      <button
        className="rounded-full bg-gray-900 px-4 py-3 text-white hover:bg-gray-800"
        onClick={async () => {
          await signOut();
          props.onSignedOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function App() {
  const [viewer, setViewer] = useState<Viewer>();
  const [loading, setLoading] = useState(true);

  const fetchViewer = async () => {
    setViewer(await getViewer());
    setLoading(false);
  };

  useEffect(() => {
    fetchViewer();
  }, []);

  if (loading) return null;

  return (
    <div className="grid min-h-dvh gap-4 p-4 text-gray-950 md:grid-cols-2">
      {viewer ? (
        <Authenticated
          viewer={viewer}
          onSignedOut={() => setViewer(undefined)}
        />
      ) : (
        <UnauthenticatedView onSignedIn={fetchViewer} />
      )}
      <div className="flex gap-8 rounded-xl bg-[#F400A1]/25 p-8 text-black">
        <div className="m-auto text-center">
          <div className="text-3xl font-bold">ΛUTH</div>
          <p>Passkey demo</p>
        </div>
      </div>
    </div>
  );
}
