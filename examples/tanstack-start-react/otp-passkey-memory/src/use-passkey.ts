import { useState } from "react";
import { createPasskey, getPasskey } from "./passkey";

type StartRegistrationResult =
  | { success: true; options: PublicKeyCredentialCreationOptionsJSON }
  | { success: false };

type UsePasskeyRegistrationOptions = {
  start: () => Promise<StartRegistrationResult>;
  verify: (credential: RegistrationResponseJSON) => Promise<{
    success: boolean;
  }>;
  onSuccess: () => void;
};

export function usePasskeyRegistration(options: UsePasskeyRegistrationOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      const start = await options.start();

      if (!start.success) {
        setError("Failed to start registration");
        setLoading(false);
        return;
      }

      const credential = await createPasskey(start.options);

      if (!credential) {
        setError("Passkey creation was cancelled");
        setLoading(false);
        return;
      }

      const result = await options.verify(credential);

      if (result.success) {
        options.onSuccess();
      } else {
        setError("Failed to register passkey");
      }
    } catch (cause) {
      console.error("Passkey registration failed:", cause);
      setError("Passkey registration failed");
    }

    setLoading(false);
  };

  return { submit, loading, error };
}

type StartAuthenticationResult =
  | { success: true; options: PublicKeyCredentialRequestOptionsJSON }
  | { success: false };

type UsePasskeyAuthenticationOptions = {
  start: () => Promise<StartAuthenticationResult>;
  verify: (credential: AuthenticationResponseJSON) => Promise<{
    success: boolean;
  }>;
  onSuccess: () => void;
};

export function usePasskeyAuthentication(
  options: UsePasskeyAuthenticationOptions,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      const start = await options.start();

      if (!start.success) {
        setError("Failed to start sign-in");
        setLoading(false);
        return;
      }

      const credential = await getPasskey(start.options);

      if (!credential) {
        setError("Passkey sign-in was cancelled");
        setLoading(false);
        return;
      }

      const result = await options.verify(credential);

      if (result.success) {
        options.onSuccess();
      } else {
        setError("Failed to sign in");
      }
    } catch (cause) {
      console.error("Passkey sign-in failed:", cause);
      setError("Passkey sign-in failed");
    }

    setLoading(false);
  };

  return { submit, loading, error };
}
