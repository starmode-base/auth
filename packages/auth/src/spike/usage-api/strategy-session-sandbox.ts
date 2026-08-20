/**
 * Consumer composition sandbox for the candidate makeAuth implementation.
 *
 * The concrete session and strategy values are inert fixtures at the consumer
 * boundary. Production values may be custom application implementations or
 * objects produced by separately exported library adapters. The strategy
 * factories here stand in for shipped adapters; their orchestration receives
 * only the narrow strategy kernel. These fixtures and calls are not candidate
 * library exports.
 */
import type {
  AuthUser,
  OtpNamespace,
  PasskeyNamespace,
  Result,
  SessionAdapter,
  SessionIdentity,
  StrategyKernel,
  WithOtpConfig,
  WithPasskeyConfig,
} from "./contracts";
import { makeAuth } from "./make-auth-sandbox";

type SandboxIdentity = SessionIdentity & {
  tenantId: string;
};

type SandboxSession = {
  establishedFor: string;
  credential: Uint8Array;
};

const sandboxSession = {
  kernel: {
    establish: async (userId) => ({
      establishedFor: userId,
      credential: new Uint8Array([1, 2, 3]),
    }),
    resolve: async (credential) =>
      credential === "session-token"
        ? {
            userId: "current-user",
            tenantId: "tenant-1",
          }
        : null,
  },
  capabilities: {
    end: async (credential: string | null) => {
      void credential;
    },
  },
} satisfies SessionAdapter<
  SandboxIdentity,
  SandboxSession,
  { end: (credential: string | null) => Promise<void> }
>;

type SandboxOtpUser = AuthUser & {
  identifier: string;
};

const registrationOptions = {
  challenge: "registration-challenge",
  pubKeyCredParams: [
    {
      alg: -7,
      type: "public-key",
    },
  ],
  rp: {
    id: "example.com",
    name: "Example",
  },
  user: {
    displayName: "Sandbox user",
    id: "sandbox-user",
    name: "sandbox@example.com",
  },
} satisfies PublicKeyCredentialCreationOptionsJSON;

const authenticationOptions = {
  challenge: "authentication-challenge",
  rpId: "example.com",
} satisfies PublicKeyCredentialRequestOptionsJSON;

const registrationCredential = {
  clientExtensionResults: {},
  id: "registered-user",
  rawId: "sign-up",
  response: {
    attestationObject: "attestation",
    authenticatorData: "authenticator-data",
    clientDataJSON: "client-data",
    publicKey: "public-key",
    publicKeyAlgorithm: -7,
    transports: [],
  },
  type: "public-key",
} satisfies RegistrationResponseJSON;

const additionalRegistrationCredential = {
  ...registrationCredential,
  id: "current-user",
  rawId: "add",
} satisfies RegistrationResponseJSON;

const authenticationCredential = {
  clientExtensionResults: {},
  id: "authenticated-user",
  rawId: "authentication",
  response: {
    authenticatorData: "authenticator-data",
    clientDataJSON: "client-data",
    signature: "signature",
    userHandle: "authenticated-user",
  },
  type: "public-key",
} satisfies AuthenticationResponseJSON;

const otpConfig = {
  request: async ({ identifier }) => {
    void identifier;
    return { success: true };
  },
  authenticate: async ({ identifier, otp }) => {
    if (otp !== "123456") {
      return {
        success: false,
        error: "invalid_otp",
      };
    }

    return {
      success: true,
      data: {
        userId: `otp:${identifier}`,
        identifier,
      },
    };
  },
} satisfies WithOtpConfig<SandboxOtpUser>;

const passkeyConfig = {
  createRegistrationOptions: async ({ intent, userId }) => {
    void intent;
    void userId;
    return {
      success: true,
      data: registrationOptions,
    };
  },
  verifyRegistration: async ({ credential }) => {
    if (credential.rawId === "add") {
      return {
        success: true,
        data: {
          intent: "add",
          userId: credential.id,
        },
      };
    }

    return {
      success: true,
      data: {
        intent: "sign-up",
        userId: credential.id,
      },
    };
  },
  createAuthenticationOptions: async () => ({
    success: true,
    data: authenticationOptions,
  }),
  verifyAuthentication: async ({ credential }) => ({
    success: true,
    data: {
      userId: credential.id,
    },
  }),
} satisfies WithPasskeyConfig;

function makeOtpStrategy<
  Identity extends SessionIdentity,
  SessionCreateResult,
  User extends AuthUser,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: WithOtpConfig<User>,
): OtpNamespace<User, SessionCreateResult> {
  return {
    request: (args) => config.request(args),
    authenticate: (args) =>
      kernel.authenticate(() => config.authenticate(args)),
  };
}

function makePasskeyStrategy<
  Identity extends SessionIdentity,
  SessionCreateResult,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: WithPasskeyConfig,
): PasskeyNamespace<SessionCreateResult> {
  return {
    createRegistrationOptions: () =>
      config.createRegistrationOptions({
        intent: "sign-up",
        userId: null,
      }),
    createAdditionalRegistrationOptions: async (token) => {
      const identity = await kernel.current(token);

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      return config.createRegistrationOptions({
        intent: "add",
        userId: identity.userId,
      });
    },
    verifyRegistration: async (token, { credential }) => {
      const registration = await config.verifyRegistration({ credential });

      if (!registration.success) {
        return registration;
      }

      if (registration.data.intent === "add") {
        const identity = await kernel.current(token);

        if (identity === null) {
          return {
            success: false,
            error: "not_authenticated",
          };
        }

        if (identity.userId !== registration.data.userId) {
          return {
            success: false,
            error: "user_mismatch",
          };
        }

        return {
          success: true,
          data: {
            intent: "add",
            userId: registration.data.userId,
          },
        };
      }

      const authentication = await kernel.authenticate<AuthUser, never>(
        async (): Promise<Result<AuthUser, never>> => ({
          success: true,
          data: { userId: registration.data.userId },
        }),
      );

      return {
        success: true,
        data: {
          intent: "sign-up",
          userId: authentication.data.user.userId,
          session: authentication.data.session,
        },
      };
    },
    createAuthenticationOptions: () => config.createAuthenticationOptions(),
    verifyAuthentication: async ({ credential }) => {
      const outcome = await kernel.authenticate(() =>
        config.verifyAuthentication({ credential }),
      );

      if (!outcome.success) {
        return outcome;
      }

      return {
        success: true,
        data: {
          userId: outcome.data.user.userId,
          session: outcome.data.session,
        },
      };
    },
  };
}

const auth = makeAuth(sandboxSession, (kernel) => ({
  otp: makeOtpStrategy(kernel, otpConfig),
  passkeys: makePasskeyStrategy(kernel, passkeyConfig),
}));

async function runSandbox(): Promise<void> {
  const failedOtp = await auth.strategies.otp.authenticate({
    identifier: "sandbox@example.com",
    otp: "invalid",
  });

  if (failedOtp.success) {
    throw new Error("Invalid OTP authenticated");
  }

  const successfulOtp = await auth.strategies.otp.authenticate({
    identifier: "sandbox@example.com",
    otp: "123456",
  });

  if (
    !successfulOtp.success ||
    !("data" in successfulOtp) ||
    successfulOtp.data.session.establishedFor !== "otp:sandbox@example.com"
  ) {
    throw new Error("OTP authentication did not establish its user");
  }

  await auth.strategies.passkeys.verifyAuthentication({
    credential: authenticationCredential,
  });
  await auth.strategies.passkeys.verifyRegistration(null, {
    credential: registrationCredential,
  });
  await auth.strategies.passkeys.createAdditionalRegistrationOptions(
    "session-token",
  );

  const passkeyAdd = await auth.strategies.passkeys.verifyRegistration(
    "session-token",
    { credential: additionalRegistrationCredential },
  );

  if (!passkeyAdd.success) {
    throw new Error("Adding a passkey for the current user failed");
  }

  const signedOutAdd =
    await auth.strategies.passkeys.createAdditionalRegistrationOptions(null);

  if (signedOutAdd.success) {
    throw new Error("A signed-out user began adding a passkey");
  }

  const viewer = await auth.session.get("session-token");

  if (viewer === null || viewer.tenantId !== "tenant-1") {
    throw new Error("The presented credential did not resolve");
  }

  if ((await auth.session.get(null)) !== null) {
    throw new Error("A missing credential resolved to an identity");
  }

  await auth.session.end("session-token");
}

await runSandbox();
