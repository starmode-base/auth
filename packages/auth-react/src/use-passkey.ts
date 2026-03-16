import { useState } from "react";
import { createPasskey, getPasskey } from "@starmode/auth/client";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationCredential,
  AuthenticationCredential,
} from "@starmode/auth/client";

type StartRegistrationResult =
  | {
      success: true;
      registrationToken: string;
      options: PublicKeyCredentialCreationOptionsJSON;
    }
  | { success: false; [key: string]: unknown };

type UsePasskeyRegistrationOptions = {
  start: () => Promise<StartRegistrationResult>;
  verify: (args: {
    registrationToken: string;
    credential: RegistrationCredential;
  }) => Promise<{ success: boolean }>;
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
        setLoading(false);
        return;
      }

      const result = await options.verify({
        registrationToken: start.registrationToken,
        credential,
      });

      if (result.success) {
        options.onSuccess();
      } else {
        setError("Failed to register passkey");
      }
    } catch {
      setError("Passkey registration failed");
    }

    setLoading(false);
  };

  return { submit, loading, error };
}

type UsePasskeyAuthenticationOptions = {
  start: () => Promise<{
    options: PublicKeyCredentialRequestOptionsJSON;
  }>;
  verify: (args: {
    credential: AuthenticationCredential;
  }) => Promise<{ success: boolean }>;
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
      const { options: authOptions } = await options.start();

      const credential = await getPasskey(authOptions);

      if (!credential) {
        setLoading(false);
        return;
      }

      const result = await options.verify({ credential });

      if (result.success) {
        options.onSuccess();
      } else {
        setError("Failed to sign in");
      }
    } catch {
      setError("Passkey sign-in failed");
    }

    setLoading(false);
  };

  return { submit, loading, error };
}
