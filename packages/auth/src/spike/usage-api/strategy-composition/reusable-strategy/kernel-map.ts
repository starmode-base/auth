import type { AuthUser, SessionPort, StrategyKernel } from "./contracts";

/** Public session reads shared by every strategy map. */
export type KernelMapSessionNamespace<Identity extends AuthUser> = {
  get: () => Promise<Identity | null>;
};

/** Auth surface produced by one kernel bound namespace map. */
export type KernelMapAuth<
  Identity extends AuthUser,
  Namespaces extends Record<string, object>,
> = {
  session: KernelMapSessionNamespace<Identity>;
  strategies: Namespaces;
};

function makeStrategyKernel<Identity extends AuthUser, SessionCreateResult>(
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

/** Constructs auth once from the final kernel bound namespace map. */
export function makeAuth<
  Identity extends AuthUser,
  SessionCreateResult,
  const Namespaces extends Record<string, object>,
>(config: {
  session: SessionPort<Identity, SessionCreateResult>;
  strategies: (
    kernel: StrategyKernel<Identity, SessionCreateResult>,
  ) => Namespaces;
}): KernelMapAuth<Identity, Namespaces> {
  const kernel = makeStrategyKernel(config.session);

  return {
    session: {
      get: () => config.session.current(),
    },
    strategies: config.strategies(kernel),
  };
}
