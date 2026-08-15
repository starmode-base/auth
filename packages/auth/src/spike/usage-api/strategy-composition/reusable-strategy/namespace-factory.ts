import type {
  AuthUser,
  SessionPort,
  StrategyKernel,
} from "./contracts";

/** A reusable strategy that constructs one or more named namespaces. */
export type NamespaceFactory<
  Identity extends AuthUser,
  SessionCreateResult,
  Namespaces extends Record<string, object>,
> = (
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) => Namespaces;

/** Runtime builder that accumulates complete named namespaces. */
export type NamespaceFactoryBuilder<
  Identity extends AuthUser,
  SessionCreateResult,
  Installed extends Record<string, object>,
> = {
  strategies: Installed;
  addStrategy: <Added extends Record<string, object>>(
    strategy: Extract<keyof Installed, keyof Added> extends never
      ? NamespaceFactory<Identity, SessionCreateResult, Added>
      : never,
  ) => NamespaceFactoryBuilder<
    Identity,
    SessionCreateResult,
    Installed & Added
  >;
};

function makeStrategyKernel<
  Identity extends AuthUser,
  SessionCreateResult,
>(
  session: SessionPort<Identity, SessionCreateResult>,
): StrategyKernel<Identity, SessionCreateResult> {
  return {
    authenticate: async (prove) => {
      const proof = await prove();

      if (!proof.success) {
        return proof;
      }

      if (!("data" in proof)) {
        // Invariant: successful authentication always returns an AuthUser.
        throw new Error("Successful authentication returned no user");
      }

      const createdSession = await session.establish(proof.data.userId);

      return {
        success: true,
        data: {
          user: proof.data,
          session: createdSession,
        },
      };
    },
    current: () => session.current(),
  };
}

function makeNamespaceFactoryBuilder<
  Identity extends AuthUser,
  SessionCreateResult,
  Installed extends Record<string, object>,
>(
  session: SessionPort<Identity, SessionCreateResult>,
  strategies: Installed,
): NamespaceFactoryBuilder<
  Identity,
  SessionCreateResult,
  Installed
> {
  const kernel = makeStrategyKernel(session);

  return {
    strategies,
    addStrategy: (strategy) =>
      makeNamespaceFactoryBuilder(session, {
        ...strategies,
        ...strategy(kernel),
      }),
  };
}

/** Constructs an empty auth value that accepts reusable strategy factories. */
export function makeAuth<
  Identity extends AuthUser,
  SessionCreateResult,
>(config: {
  session: SessionPort<Identity, SessionCreateResult>;
}): NamespaceFactoryBuilder<
  Identity,
  SessionCreateResult,
  Record<never, never>
> {
  return makeNamespaceFactoryBuilder(config.session, {});
}
