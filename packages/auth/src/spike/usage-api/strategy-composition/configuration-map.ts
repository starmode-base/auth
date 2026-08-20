import type {
  AuthSurface,
  AuthUser,
  MakeAuthConfig,
  StrategyApis,
  StrategyMap,
} from "./contracts";

/** Public auth value inferred from one complete strategy map. */
export type ConfigurationAuth<
  Identity extends AuthUser,
  SessionCreateResult,
  Strategies extends StrategyMap<Identity, SessionCreateResult>,
> = AuthSurface<
  Identity,
  SessionCreateResult,
  StrategyApis<Strategies, Identity, SessionCreateResult>
>;

/** Candidate configuration map constructor. */
export declare function makeAuth<
  Identity extends AuthUser,
  SessionCreateResult,
  const Strategies extends StrategyMap<Identity, SessionCreateResult>,
>(
  config: MakeAuthConfig<Identity, SessionCreateResult> & {
    strategies: Strategies;
  },
): ConfigurationAuth<Identity, SessionCreateResult, Strategies>;
