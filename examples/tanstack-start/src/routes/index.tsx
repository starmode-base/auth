import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth.client";
import { signUp, getViewer } from "../lib/auth.server";
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
    const viewer = await getViewer();
    return { viewer };
  },
});

function EmailForm({
  email,
  setEmail,
  onSubmit,
  onPasskeySignIn,
  loading,
}: {
  email: string;
  setEmail: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onPasskeySignIn: () => void;
  loading: boolean;
}) {
  return (
    <Stack direction="col" gap="wide">
      <form onSubmit={onSubmit}>
        <Stack direction="col" gap="wide">
          <Heading>Sign up</Heading>
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
              {loading ? "Sending..." : "Send OTP"}
            </Button>
            <Text>Check your server terminal for the OTP</Text>
          </Stack>
        </Stack>
      </form>

      <div className="border-t border-gray-200 pt-6">
        <Stack direction="col">
          <Text>Already have a passkey?</Text>
          <Button
            variant="secondary"
            onClick={onPasskeySignIn}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in with passkey"}
          </Button>
        </Stack>
      </div>
    </Stack>
  );
}

function OtpForm({
  email,
  otp,
  setOtp,
  onSubmit,
  onBack,
  loading,
  error,
}: {
  email: string;
  otp: string;
  setOtp: (otp: string) => void;
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
            OTP sent to <span className="text-cyan-400">{email}</span>
          </Text>
        </Stack>
        <Stack direction="col">
          <Label>Enter the OTP</Label>
          <Input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
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
              {loading ? "Verifying..." : "Continue"}
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

function PasskeyRegistrationForm({
  onRegister,
  onBack,
  loading,
  error,
}: {
  onRegister: () => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Stack direction="col" gap="wide">
      <Stack direction="col">
        <Heading>Create passkey</Heading>
        <Text>
          Set up a passkey to securely sign in without a password. Your device
          will use biometrics or your screen lock.
        </Text>
      </Stack>
      <Stack direction="col">
        {error && <ErrorText>{error}</ErrorText>}
        <Stack direction="row">
          <Button
            variant="primary"
            onClick={onRegister}
            disabled={loading}
            className="flex-1"
          >
            {loading ? "Creating..." : "Create passkey"}
          </Button>
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Back
          </Button>
        </Stack>
      </Stack>
    </Stack>
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

type Step = "email" | "otp" | "passkey-register";

function RouteComponent() {
  const router = useRouter();
  const { viewer } = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [registrationToken, setRegistrationToken] = useState<string | null>(
    null,
  );
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.requestOtp({ identifier: email });
      if (result.success) setStep("otp");
    } catch {
      setError("Failed to send OTP");
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Sign up flow: verify OTP + upsert user + get registration token
      const result = await signUp({ data: { identifier: email, otp } });
      if (result.success && result.registrationToken) {
        setRegistrationToken(result.registrationToken);
        setStep("passkey-register");
      } else {
        setError("Invalid OTP");
      }
    } catch {
      setError("Failed to verify OTP");
    }
    setLoading(false);
  };

  const handlePasskeyRegister = async () => {
    if (!registrationToken) return;

    setLoading(true);
    setError(null);
    try {
      // Get registration options from server
      const optionsResult = await authClient.generateRegistrationOptions({
        registrationToken,
      });

      if (!optionsResult.success || !optionsResult.options) {
        setError("Failed to get registration options");
        setLoading(false);
        return;
      }

      // Create passkey (handles browser ceremony + serialization)
      const credential = await authClient.createPasskey(optionsResult.options);

      if (!credential) {
        setError("Passkey creation was cancelled");
        setLoading(false);
        return;
      }

      // Verify with server
      const result = await authClient.verifyRegistration({
        registrationToken,
        credential,
      });

      if (result.success) {
        await router.invalidate();
      } else {
        setError("Failed to register passkey");
      }
    } catch (err) {
      console.error("Passkey registration error:", err);
      setError("Passkey registration failed");
    }
    setLoading(false);
  };

  const handlePasskeySignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get authentication options from server
      const { options } = await authClient.generateAuthenticationOptions();

      // Get passkey (handles browser ceremony + serialization)
      const credential = await authClient.getPasskey(options);

      if (!credential) {
        setError("Passkey sign-in was cancelled");
        setLoading(false);
        return;
      }

      // Verify with server
      const result = await authClient.verifyAuthentication({ credential });

      if (result.success) {
        await router.invalidate();
      } else {
        setError("Invalid passkey");
      }
    } catch (err) {
      console.error("Passkey sign-in error:", err);
      setError("Passkey sign-in failed");
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    await authClient.signOut();
    await router.invalidate();
    setEmail("");
    setOtp("");
    setRegistrationToken(null);
    setStep("email");
    setLoading(false);
  };

  const handleBack = () => {
    if (step === "passkey-register") {
      setStep("otp");
      setError(null);
    } else {
      setStep("email");
      setOtp("");
      setError(null);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-8">
      <div className="w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-4xl font-bold">
            <span className="text-gray-300">STΛR MODΞ</span>{" "}
            <span className="bg-linear-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              ΛUTH
            </span>
          </h1>
          <Text>Passkey authentication demo</Text>
        </div>

        <div className="bg-white rounded p-8 text-center shadow-xl">
          {viewer ? (
            <AuthenticatedView
              userId={viewer.userId}
              onSignOut={handleSignOut}
              loading={loading}
            />
          ) : step === "email" ? (
            <EmailForm
              email={email}
              setEmail={setEmail}
              onSubmit={handleRequestOtp}
              onPasskeySignIn={handlePasskeySignIn}
              loading={loading}
            />
          ) : step === "otp" ? (
            <OtpForm
              email={email}
              otp={otp}
              setOtp={setOtp}
              onSubmit={handleVerifyOtp}
              onBack={handleBack}
              loading={loading}
              error={error}
            />
          ) : (
            <PasskeyRegistrationForm
              onRegister={handlePasskeyRegister}
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
