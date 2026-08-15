import type {
  AuthUser,
  SessionPort,
  StrategyKernel,
} from "./contracts";

/** One normalized result every session mechanism must return. */
export type IssuedSessionCredentials = {
  access: {
    token: string;
    expiresAt: Date | null;
  };
  refresh: {
    token: string;
    expiresAt: Date | null;
  } | null;
};

/** Session port after choosing one universal creation result. */
export type UniversalSessionPort<Identity extends AuthUser> = SessionPort<
  Identity,
  IssuedSessionCredentials
>;

/** A namespace no longer needs to vary by session mechanism. */
export type UniversalStrategy<Api extends object> = {
  mount: <Identity extends AuthUser>(
    kernel: StrategyKernel<Identity, IssuedSessionCredentials>,
  ) => Api;
};

/** Installs one session independent strategy without higher kinded types. */
export declare function installUniversalStrategy<
  Identity extends AuthUser,
  Api extends object,
>(
  session: UniversalSessionPort<Identity>,
  strategy: UniversalStrategy<Api>,
): Api;
