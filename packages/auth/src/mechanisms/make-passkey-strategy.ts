import type {
  AuthUser,
  PasskeyStrategy,
  Result,
  SessionIdentity,
  StrategyKernel,
  PasskeyEngine,
} from "../contracts";

/** Mounts a complete passkey strategy on the kernel */
export function makePasskeyStrategy<
  Identity extends SessionIdentity,
  SessionCredential,
>(
  kernel: StrategyKernel<Identity, SessionCredential>,
  config: PasskeyEngine,
): PasskeyStrategy<SessionCredential> {
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
    verifyRegistration: ({ credential }) =>
      signIn(() => config.verifyRegistration({ credential })),
    verifyVouchedRegistration: ({ credential }) =>
      signIn(() => config.verifyVouchedRegistration({ credential })),
    verifyAdditionalRegistration: async (token, { credential }) => {
      const identity = await kernel.current(token);

      if (identity === null) {
        return { success: false, error: "not_authenticated" };
      }

      const registration = await config.verifyAdditionalRegistration({
        credential,
        userId: identity.userId,
      });

      if (!registration.success) {
        return registration;
      }

      return { success: true, data: { userId: registration.data.userId } };
    },
    createAuthenticationOptions: () => config.createAuthenticationOptions(),
    verifyAuthentication: ({ credential }) =>
      signIn(() => config.verifyAuthentication({ credential })),
  };

  async function signIn<E extends string>(
    prove: () => Promise<Result<AuthUser, E>>,
  ): Promise<Result<{ userId: string; session: SessionCredential }, E>> {
    const outcome = await kernel.authenticate(prove);

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
  }
}
