/** Shared fixtures for reusable strategy type experiments. */

/** Expected command result. Infrastructure failures throw. */
export type Result<T, E extends string> =
  | ([T] extends [void] ? { success: true } : { success: true; data: T })
  | ([E] extends [never] ? never : { success: false; error: E });

/** The identity every authentication strategy establishes. */
export type AuthUser = {
  userId: string;
};

/** Minimal session dependency used only by these type experiments. */
export type SessionPort<
  Identity extends AuthUser,
  SessionCreateResult,
> = {
  establish: (userId: string) => Promise<SessionCreateResult>;
  current: () => Promise<Identity | null>;
};

/** Narrow kernel authority available while mounting a strategy namespace. */
export type StrategyKernel<
  Identity extends AuthUser,
  SessionCreateResult,
> = {
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
  current: () => Promise<Identity | null>;
};

/** Session result used by a cookie oriented binding. */
export type CookieSessionResult = {
  cookie: {
    name: string;
    value: string;
    expiresAt: Date;
  };
};

/** Session result used by an explicit header oriented binding. */
export type HeaderSessionResult = {
  accessToken: string;
  refreshToken: string | null;
};

/** Identity fixture with an application claim that must remain inferred. */
export type SessionIdentity = AuthUser & {
  role: "member";
};
