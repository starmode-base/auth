import type {
  AuthUser,
  PasskeyNamespace,
  Result,
  SessionIdentity,
  StrategyKernel,
  WithPasskeyConfig,
} from "../contracts";

/** Mounts a complete passkey strategy on the kernel */
export function makePasskeyStrategy<
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
    createVouchedRegistrationOptions: ({ userId }) =>
      config.createRegistrationOptions({ intent: "vouched", userId }),
    createAdditionalRegistrationOptions: async (token) => {
      const identity = await kernel.current(token);

      if (identity === null) {
        return { success: false, error: "not_authenticated" };
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
          return { success: false, error: "not_authenticated" };
        }

        if (identity.userId !== registration.data.userId) {
          return { success: false, error: "user_mismatch" };
        }

        return {
          success: true,
          data: { intent: "add", userId: registration.data.userId },
        };
      }

      const intent = registration.data.intent;
      const authentication = await kernel.authenticate<AuthUser, never>(
        async (): Promise<Result<AuthUser, never>> => ({
          success: true,
          data: { userId: registration.data.userId },
        }),
      );

      return {
        success: true,
        data: {
          intent,
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
