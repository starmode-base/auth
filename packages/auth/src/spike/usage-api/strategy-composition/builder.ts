import type {
  AuthStrategy,
  AuthSurface,
  AuthUser,
  MakeAuthConfig,
  NoStrategies,
} from "./contracts";

/**
 * Open strategy builder.
 *
 * Each call preserves the installed namespace under its literal name. A name
 * already present in Installed is rejected when TypeScript knows that name.
 */
export type StrategyBuilder<
  Identity extends AuthUser,
  SessionCreateResult,
  Installed extends Record<string, object>,
> = AuthSurface<Identity, SessionCreateResult, Installed> & {
  addStrategy: <const Name extends string, Api extends object>(
    name: Name extends keyof Installed ? never : Name,
    strategy: AuthStrategy<Identity, SessionCreateResult, Api>,
  ) => StrategyBuilder<
    Identity,
    SessionCreateResult,
    Installed & Record<Name, Api>
  >;
};

/** Candidate generic accumulating builder. */
export declare function makeAuth<
  Identity extends AuthUser,
  SessionCreateResult,
>(
  config: MakeAuthConfig<Identity, SessionCreateResult>,
): StrategyBuilder<Identity, SessionCreateResult, NoStrategies>;
