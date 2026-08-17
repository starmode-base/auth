/**
 * Candidate library implementation for strategy composition.
 *
 * makeAuth is the only public candidate exported from this file. The strategy
 * kernel constructor is an internal microkernel detail. This spike
 * implementation contains no mechanism branches and is not production
 * library code.
 */
import type {
  Auth,
  SessionAdapter,
  SessionIdentity,
  SessionKernel,
  StrategyKernel,
} from "./contracts";

function makeStrategyKernel<
  Identity extends SessionIdentity,
  SessionCreateResult,
>(
  session: SessionKernel<Identity, SessionCreateResult>,
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
    current: (credential) => session.resolve(credential),
  };
}

/** Candidate public constructor for the kernel bound namespace map */
export function makeAuth<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
  const Namespaces extends Record<string, object>,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
  strategies: (
    kernel: StrategyKernel<NoInfer<Identity>, NoInfer<SessionCreateResult>>,
  ) => Namespaces,
): Auth<Identity, Capabilities, Namespaces> {
  return {
    session: {
      ...session.capabilities,
      get: (credential) => session.kernel.resolve(credential),
    },
    strategies: strategies(makeStrategyKernel(session.kernel)),
  };
}
