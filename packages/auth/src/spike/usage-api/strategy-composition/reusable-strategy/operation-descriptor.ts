import type {
  AuthUser,
  Result,
  SessionPort,
} from "./contracts";

/** Ordinary strategy operation with no session authority. */
export type PublicOperation<Args, Output> = {
  kind: "public";
  run: (args: Args) => Promise<Output>;
};

/** Strategy proof that the kernel converts into a session. */
export type AuthenticationOperation<
  Args,
  User extends AuthUser,
  E extends string,
> = {
  kind: "authentication";
  run: (args: Args) => Promise<Result<User, E>>;
};

/** Operation scoped to the user established by the current session. */
export type CurrentUserOperation<Args, Output, E extends string> = {
  kind: "current-user";
  run: (
    user: AuthUser,
    args: Args,
  ) => Promise<Result<Output, E>>;
};

/** Every operation category understood by the generic kernel projector. */
export type StrategyOperation =
  | PublicOperation<never, unknown>
  | AuthenticationOperation<never, AuthUser, string>
  | CurrentUserOperation<never, unknown, string>;

/** One reusable strategy description with arbitrary operation names. */
export type StrategyDefinition = Record<string, StrategyOperation>;

/** Defines an ordinary strategy operation without changing its result. */
export function publicOperation<Args, Output>(
  run: (args: Args) => Promise<Output>,
): PublicOperation<Args, Output> {
  return { kind: "public", run };
}

/** Defines an operation that establishes an authenticated user. */
export function authenticationOperation<
  Args,
  User extends AuthUser,
  E extends string,
>(
  run: (args: Args) => Promise<Result<User, E>>,
): AuthenticationOperation<Args, User, E> {
  return { kind: "authentication", run };
}

/** Defines an operation whose authority comes from the current session. */
export function currentUserOperation<
  Args,
  Output,
  E extends string,
>(
  run: (
    user: AuthUser,
    args: Args,
  ) => Promise<Result<Output, E>>,
): CurrentUserOperation<Args, Output, E> {
  return { kind: "current-user", run };
}

/** Projects one operation through the configured session type. */
export type StrategyOperationApi<
  Operation,
  SessionCreateResult,
> = Operation extends PublicOperation<infer Args, infer Output>
  ? (args: Args) => Promise<Output>
  : Operation extends AuthenticationOperation<
        infer Args,
        infer User,
        infer E
      >
    ? (args: Args) => Promise<
        Result<
          {
            user: User;
            session: SessionCreateResult;
          },
          E
        >
      >
    : Operation extends CurrentUserOperation<
          infer Args,
          infer Output,
          infer E
        >
      ? (args: Args) => Promise<
          Result<Output, E | "not_authenticated">
        >
      : never;

/** Exact public namespace produced from a reusable strategy description. */
export type StrategyNamespace<
  Definition extends StrategyDefinition,
  SessionCreateResult,
> = {
  [Name in keyof Definition]: StrategyOperationApi<
    Definition[Name],
    SessionCreateResult
  >;
};

/** Type projection under test. Runtime projection is outside this experiment. */
export declare function installStrategy<
  Identity extends AuthUser,
  SessionCreateResult,
  const Definition extends StrategyDefinition,
>(
  session: SessionPort<Identity, SessionCreateResult>,
  definition: Definition,
): StrategyNamespace<Definition, SessionCreateResult>;
