/**
 * Candidate library implementation for strategy composition.
 *
 * makeAuth is the only public candidate exported from this file. Every other
 * function is an internal microkernel detail. This spike implementation covers
 * the complete write-capable builder path and is not production library code.
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

/** Candidate public builder for write-capable auth instances */
export function makeAuth<
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
