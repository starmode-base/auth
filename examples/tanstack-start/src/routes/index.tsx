import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { makeAuthClient } from "@starmode/auth/client";
import type { AuthTransport } from "@starmode/auth/client";
import { authAction, getSession } from "../lib/auth.server";
import {
  Input,
  Button,
  Label,
  Heading,
  Text,
  ErrorText,
  Stack,
} from "../lib/atoms";

export const Route = createFileRoute("/")({
  component: RouteComponent,
  loader: async () => {
    const session = await getSession();
    return { session };
  },
});

// Server function transport adapter
const transport: AuthTransport = (request) => authAction({ data: request });

// Type-safe auth client
const auth = makeAuthClient({ transport });

function EmailForm({
  email,
  setEmail,
  onSubmit,
  loading,
}: {
  email: string;
  setEmail: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}) {
  return (
    <form onSubmit={onSubmit}>
      <Stack direction="col" gap="wide">
        <Heading>Create an account</Heading>
        <Stack direction="col">
          <Label>Email address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send code"}
          </Button>
          <Text>Check your server terminal for the OTP code</Text>
        </Stack>
      </Stack>
    </form>
  );
}

function CodeForm({
  email,
  code,
  setCode,
  onSubmit,
  onBack,
  loading,
  error,
}: {
  email: string;
  code: string;
  setCode: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <form onSubmit={onSubmit}>
      <Stack direction="col" gap="wide">
        <Stack direction="col">
          <Heading>Check your email</Heading>
          <Text>
            Code sent to <span className="text-cyan-400">{email}</span>
          </Text>
        </Stack>
        <Stack direction="col">
          <Label>Enter the verification code</Label>
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            required
            maxLength={6}
            className="text-2xl tracking-widest text-center"
            data-1p-ignore
          />
          {error && <ErrorText>{error}</ErrorText>}
          <Stack direction="row">
            <Button
              variant="primary"
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
            <Button type="button" variant="secondary" onClick={onBack}>
              Back
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </form>
  );
}

function AuthenticatedView({
  userId,
  onSignOut,
  loading,
}: {
  userId: string;
  onSignOut: () => void;
  loading: boolean;
}) {
  return (
    <Stack direction="col" gap="wide">
      <Stack direction="col">
        <Heading>Authenticated</Heading>
        <Text>
          User ID: <span className="text-cyan-400">{userId}</span>
        </Text>
      </Stack>
      <Stack direction="col">
        <Button variant="secondary" onClick={onSignOut} disabled={loading}>
          {loading ? "Signing out..." : "Sign out"}
        </Button>
      </Stack>
    </Stack>
  );
}

function RouteComponent() {
  const router = useRouter();
  const { session } = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await auth.requestOtp({ email });
    if (result.success) setStep("code");
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await auth.verifyOtp({ email, code });
    if (result.valid) {
      // Session cookie is set server-side, reload to get fresh session
      await router.invalidate();
    } else {
      setError("Invalid code");
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    await auth.signOut();
    // Cookie is cleared server-side, reload to reflect logged out state
    await router.invalidate();
    setEmail("");
    setCode("");
    setStep("email");
    setLoading(false);
  };

  const handleBack = () => {
    setStep("email");
    setCode("");
    setError(null);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-8">
      <div className="w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-4xl font-bold">
            <span className="text-gray-300">STΛR MODΞ</span>{" "}
            <span className="bg-linear-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              AUTH
            </span>
          </h1>
          <Text>OTP authentication demo</Text>
        </div>

        <div className="bg-white rounded p-8 text-center shadow-xl">
          {session?.userId ? (
            <AuthenticatedView
              userId={session.userId}
              onSignOut={handleSignOut}
              loading={loading}
            />
          ) : step === "email" ? (
            <EmailForm
              email={email}
              setEmail={setEmail}
              onSubmit={handleRequestOtp}
              loading={loading}
            />
          ) : (
            <CodeForm
              email={email}
              code={code}
              setCode={setCode}
              onSubmit={handleVerifyOtp}
              onBack={handleBack}
              loading={loading}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}
