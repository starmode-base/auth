/**
 * Shared contracts for comparing open strategy composition syntax.
 *
 * These types isolate the composition question. The session port is only the
 * minimum fixture needed to prove session establishment, current identity,
 * and the public visibility of direct creation. It is not a candidate for the
 * unsettled session lifecycle contract.
 */

/** Expected command result. Infrastructure failures throw. */
export type Result<T, E extends string> =
  | ([T] extends [void] ? { success: true } : { success: true; data: T })
  | ([E] extends [never] ? never : { success: false; error: E });

/** The identity every authentication strategy establishes. */
export type AuthUser = {
  userId: string;
};

/**
 * Minimal session fixture for the composition comparison.
 *
 * establish is the private kernel transition. current is the read only
 * authority used to scope authentication resource operations.
 */
export type SessionPort<
  Identity extends AuthUser,
  SessionCreateResult,
> = {
  establish: (userId: string) => Promise<SessionCreateResult>;
  current: () => Promise<Identity | null>;
};

/** The only session capabilities granted to an installed strategy. */
export type StrategyKernel<
  Identity extends AuthUser,
  SessionCreateResult,
> = {
  /**
   * Runs one proof and establishes a session only for its successful userId.
   * The strategy never receives the session implementation.
   */
  authenticate: <User extends AuthUser, E extends string>(
    prove: () => Promise<Result<User, E>>,
  ) => Promise<
    Result<
      {
        user: User;
        session: SessionCreateResult;
      },
      E
    >
  >;
  /** Repeatable read only resolution of the current session identity. */
  current: () => Promise<Identity | null>;
};

/**
 * One complete authentication strategy as installed for a session port.
 *
 * The collector preserves the concrete namespace produced for the configured
 * identity and session result.
 */
export type AuthStrategy<
  Identity extends AuthUser,
  SessionCreateResult,
  Api extends object,
> = {
  mount: (
    kernel: StrategyKernel<Identity, SessionCreateResult>,
  ) => Api;
};

/** Broad strategy map for validation with satisfies. */
export type StrategyMap<
  Identity extends AuthUser,
  SessionCreateResult,
> = Record<
  string,
  AuthStrategy<Identity, SessionCreateResult, object>
>;

/** Extracts the namespace one strategy produces for the configured session. */
export type StrategyApiOf<
  Strategy,
  Identity extends AuthUser,
  SessionCreateResult,
> = Strategy extends AuthStrategy<
  Identity,
  SessionCreateResult,
  infer Api
>
  ? Api
  : never;

/** Maps installed strategy names to their exact public namespaces. */
export type StrategyApis<
  Strategies,
  Identity extends AuthUser,
  SessionCreateResult,
> = {
  [Name in keyof Strategies]: StrategyApiOf<
    Strategies[Name],
    Identity,
    SessionCreateResult
  >;
};

/** Public session operations retained after a strategy is installed. */
export type SessionManagementNamespace<Identity extends AuthUser> = {
  get: () => Promise<Identity | null>;
};

/** Session only escape hatch for bespoke application authentication. */
export type SessionNamespace<
  Identity extends AuthUser,
  SessionCreateResult,
> = SessionManagementNamespace<Identity> & {
  create: (args: { userId: string }) => Promise<SessionCreateResult>;
};

/** No installed strategy names. */
export type NoStrategies = Record<never, never>;

/** Public surface shared by both composition candidates. */
export type AuthSurface<
  Identity extends AuthUser,
  SessionCreateResult,
  Installed extends Record<string, object>,
> = {
  session: keyof Installed extends never
    ? SessionNamespace<Identity, SessionCreateResult>
    : SessionManagementNamespace<Identity>;
  strategies: Installed;
};

/** Shared makeAuth input for the comparison. */
export type MakeAuthConfig<
  Identity extends AuthUser,
  SessionCreateResult,
> = {
  debug: boolean;
  session: SessionPort<Identity, SessionCreateResult>;
};
