import { createFileRoute } from "@tanstack/react-router";
import { requestOtp, verifyOtp, signOut, getViewer } from "../auth-server";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: App });

type Viewer = { userId: string; email: string };

function Step(props: {
  onSubmit: (value: string) => void;
  placeholder: string;
  label: string;
  error: string | null;
  title: string;
  description: string;
}) {
  const [value, setValue] = useState("");

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">{props.title}</div>
        <div className="text-gray-500">{props.description}</div>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder={props.placeholder}
          className="h-10 border-b border-gray-300 bg-transparent placeholder:text-gray-500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {props.error !== null ? (
          <div className="text-red-500">{props.error}</div>
        ) : null}
      </div>
      <button
        type="submit"
        className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800"
        onClick={() => props.onSubmit(value)}
      >
        {props.label}
      </button>
    </>
  );
}

function AuthFlow(props: { onSignedIn: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (email === null) {
    return (
      <Step
        onSubmit={async (email) => {
          const result = await requestOtp({ data: { identifier: email } });

          if (result.success) {
            setEmail(email);
            setError(null);
          } else {
            setError("Failed to send one-time password");
          }
        }}
        placeholder="Email address"
        label="Send one-time password"
        error={error}
        title="Welcome!"
        description="Let's get you signed in."
      />
    );
  }

  return (
    <Step
      onSubmit={async (otp) => {
        const result = await verifyOtp({
          data: { identifier: email, otp },
        });

        if (result.success) {
          props.onSignedIn();
        } else {
          setError("Invalid one-time password");
        }
      }}
      placeholder="One-time password"
      label="Continue"
      error={error}
      title="Check your email"
      description="Enter your one-time password."
    />
  );
}

function Authenticated(props: { viewer: Viewer; onSignedOut: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">Signed in</div>
        <div className="text-gray-500">{props.viewer.email}</div>
      </div>
      <button
        className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800"
        onClick={async () => {
          await signOut();
          props.onSignedOut();
        }}
      >
        Sign out
      </button>
    </>
  );
}

function App() {
  const [viewer, setViewer] = useState<Viewer>();
  const [loading, setLoading] = useState(true);

  const fetchViewer = async () => {
    const v = await getViewer();
    setViewer(v);
    setLoading(false);
  };

  useEffect(() => {
    fetchViewer();
  }, []);

  if (loading) return null;

  return (
    <div className="grid min-h-dvh gap-4 p-4 text-gray-950 md:grid-cols-2">
      <div className="m-auto flex w-full max-w-sm flex-col gap-8 p-8">
        {viewer ? (
          <Authenticated
            viewer={viewer}
            onSignedOut={() => setViewer(undefined)}
          />
        ) : (
          <AuthFlow onSignedIn={fetchViewer} />
        )}
      </div>
      <div className="flex gap-8 rounded-xl bg-pink-500 p-8">
        <div className="m-auto text-center">
          <div className="text-3xl font-bold">STΛR MODΞ</div>
          <p>One-time password demo</p>
        </div>
      </div>
    </div>
  );
}
