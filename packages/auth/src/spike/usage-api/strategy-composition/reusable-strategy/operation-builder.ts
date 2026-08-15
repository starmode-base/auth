import type {
  AuthUser,
  SessionPort,
} from "./contracts";
import type {
  StrategyDefinition,
  StrategyNamespace,
} from "./operation-descriptor";

type NoStrategies = Record<never, never>;

/**
 * Accumulating builder for operation described strategies.
 *
 * The configured session result is applied when each strategy is installed.
 */
export type OperationStrategyBuilder<
  Identity extends AuthUser,
  SessionCreateResult,
  Installed extends Record<string, object>,
> = {
  strategies: Installed;
  addStrategy: <
    const Name extends string,
    const Definition extends StrategyDefinition,
  >(
    name: Name extends keyof Installed ? never : Name,
    strategy: Definition,
  ) => OperationStrategyBuilder<
    Identity,
    SessionCreateResult,
    Installed &
      Record<
        Name,
        StrategyNamespace<Definition, SessionCreateResult>
      >
  >;
};

/** Type only constructor used to test reusable strategy inference. */
export declare function makeAuth<
  Identity extends AuthUser,
  SessionCreateResult,
>(config: {
  session: SessionPort<Identity, SessionCreateResult>;
}): OperationStrategyBuilder<
  Identity,
  SessionCreateResult,
  NoStrategies
>;
