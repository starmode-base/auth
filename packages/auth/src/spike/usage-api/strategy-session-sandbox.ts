/**
 * Runtime-shaped sandbox for strategy and session orchestration.
 *
 * The constructors model only the microkernel logic between trusted
 * strategies and an arbitrary session kernel. They do not implement OTP,
 * WebAuthn, credentials, persistence, or transport.
 */
import type {
  Auth,
  AuthFull,
  AuthOtp,
  AuthPasskey,
  AuthUser,
  MakeAuthConfig,
  OtpNamespace,
  PasskeyNamespace,
  PasskeySummary,
  SessionAdapter,
  SessionIdentity,
  SessionKernel,
  SessionManagementNamespace,
  SessionNamespace,
  WithOtpConfig,
  WithPasskeyConfig,
} from "./contracts";

function makeOtpNamespace<
  Identity extends SessionIdentity,
  SessionCreateResult,
  User extends AuthUser,
>(
  session: SessionKernel<Identity, SessionCreateResult>,
  strategy: WithOtpConfig<User>,
): OtpNamespace<User, SessionCreateResult> {
  return {
    request: (args) => strategy.request(args),
    authenticate: async (args) => {
      const authentication = await strategy.authenticate(args);

      if (!authentication.success) {
        return authentication;
      }

      if (!("data" in authentication)) {
        // Invariant: successful OTP authentication always returns an AuthUser.
        throw new Error("Successful OTP authentication returned no user");
      }

      const createdSession = await session.establish(
        authentication.data.userId,
      );

      return {
        success: true,
        data: {
          user: authentication.data,
          session: createdSession,
        },
      };
    },
  };
}

function makePasskeyNamespace<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Summary extends PasskeySummary,
>(
  session: SessionKernel<Identity, SessionCreateResult>,
  strategy: WithPasskeyConfig<Summary>,
): PasskeyNamespace<SessionCreateResult, Summary> {
  return {
    createRegistrationOptions: () =>
      strategy.createRegistrationOptions({
        intent: "sign-up",
        userId: null,
      }),
    createAdditionalRegistrationOptions: async () => {
      const identity = await session.resolve();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      return strategy.createRegistrationOptions({
        intent: "add",
        userId: identity.userId,
      });
    },
    verifyRegistration: async (args) => {
      const registration = await strategy.verifyRegistration(args);

      if (!registration.success) {
        return registration;
      }

      if (registration.data.intent === "add") {
        return {
          success: true,
          data: {
            intent: "add",
            userId: registration.data.userId,
          },
        };
      }

      const createdSession = await session.establish(registration.data.userId);

      return {
        success: true,
        data: {
          intent: "sign-up",
          userId: registration.data.userId,
          session: createdSession,
        },
      };
    },
    createAuthenticationOptions: () => strategy.createAuthenticationOptions(),
    verifyAuthentication: async (args) => {
      const authentication = await strategy.verifyAuthentication(args);

      if (!authentication.success) {
        return authentication;
      }

      const createdSession = await session.establish(
        authentication.data.userId,
      );

      return {
        success: true,
        data: {
          userId: authentication.data.userId,
          session: createdSession,
        },
      };
    },
    list: async () => {
      const identity = await session.resolve();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      const passkeys = await strategy.list(identity.userId);

      return {
        success: true,
        data: passkeys,
      };
    },
    remove: async ({ credentialId }) => {
      const identity = await session.resolve();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      return strategy.remove(identity.userId, credentialId);
    },
  };
}

function makeSessionManagementNamespace<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
): SessionManagementNamespace<Identity, Capabilities> {
  return {
    ...session.capabilities,
    get: () => session.kernel.resolve(),
  };
}

function makeSessionNamespace<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
): SessionNamespace<Identity, SessionCreateResult, Capabilities> {
  return {
    ...session.capabilities,
    get: () => session.kernel.resolve(),
    create: ({ userId }) => session.kernel.establish(userId),
  };
}

function makeAuthFull<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
  User extends AuthUser,
  Summary extends PasskeySummary,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
  otp: WithOtpConfig<User>,
  passkey: WithPasskeyConfig<Summary>,
): AuthFull<Identity, SessionCreateResult, Capabilities, User, Summary> {
  return {
    session: makeSessionManagementNamespace(session),
    otp: makeOtpNamespace(session.kernel, otp),
    passkey: makePasskeyNamespace(session.kernel, passkey),
  };
}

function makeAuthOtp<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
  User extends AuthUser,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
  otp: WithOtpConfig<User>,
): AuthOtp<Identity, SessionCreateResult, Capabilities, User> {
  return {
    session: makeSessionManagementNamespace(session),
    otp: makeOtpNamespace(session.kernel, otp),
    withPasskey: (passkey) => makeAuthFull(session, otp, passkey),
  };
}

function makeAuthPasskey<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
  Summary extends PasskeySummary,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
  passkey: WithPasskeyConfig<Summary>,
): AuthPasskey<Identity, SessionCreateResult, Capabilities, Summary> {
  return {
    session: makeSessionManagementNamespace(session),
    passkey: makePasskeyNamespace(session.kernel, passkey),
    withOtp: (otp) => makeAuthFull(session, otp, passkey),
  };
}

function makeAuth<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
>(
  config: MakeAuthConfig<Identity, SessionCreateResult, Capabilities>,
): Auth<Identity, SessionCreateResult, Capabilities> {
  void config.debug;

  return {
    session: makeSessionNamespace(config.session),
    withOtp: (otp) => makeAuthOtp(config.session, otp),
    withPasskey: (passkey) => makeAuthPasskey(config.session, passkey),
  };
}

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
    resolve: async () => ({
      userId: "current-user",
      tenantId: "tenant-1",
    }),
  },
  capabilities: {
    end: async () => undefined,
  },
} satisfies SessionAdapter<
  SandboxIdentity,
  SandboxSession,
  { end: () => Promise<void> }
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

const otpStrategy = {
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

const passkeyStrategy = {
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
  list: async (userId) => [
    {
      credentialId: `credential:${userId}`,
    },
  ],
  remove: async (userId, credentialId) => {
    void userId;
    void credentialId;
    return { success: true };
  },
} satisfies WithPasskeyConfig<PasskeySummary>;

const auth = makeAuth({
  debug: true,
  session: sandboxSession,
})
  .withOtp(otpStrategy)
  .withPasskey(passkeyStrategy);

async function runSandbox(): Promise<void> {
  await auth.otp.authenticate({
    identifier: "sandbox@example.com",
    otp: "invalid",
  });
  await auth.otp.authenticate({
    identifier: "sandbox@example.com",
    otp: "123456",
  });
  await auth.passkey.verifyAuthentication({
    credential: authenticationCredential,
  });
  await auth.passkey.verifyRegistration({
    credential: registrationCredential,
  });
  await auth.passkey.createAdditionalRegistrationOptions();
  await auth.passkey.verifyRegistration({
    credential: additionalRegistrationCredential,
  });
  await auth.passkey.list();
  await auth.passkey.remove({
    credentialId: "credential:current-user",
  });
  await auth.session.end();
}

await runSandbox();
