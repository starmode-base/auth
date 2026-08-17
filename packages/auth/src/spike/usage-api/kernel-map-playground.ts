/**
 * Framework-neutral playground for the kernel map construction candidate.
 *
 * makeAuth receives the session adapter and one strategy map callback. The
 * callback receives the narrow strategy kernel and returns the final named
 * namespace map. The public surface nests every strategy under
 * auth.strategies, while auth.session carries reads plus the configured
 * mechanism capabilities. Direct session creation does not exist. Bespoke
 * authentication is an explicit strategy.
 *
 * Strategy bundles are functions of the kernel. A bundle passed directly,
 * a parameterized bundle factory, and a hand written callback that spreads
 * a bundle's result are the same API at three levels of granularity.
 *
 * makeAuth, the strategy kernel, and the returned auth shape are candidate
 * declarations local to this example until promoted into contracts. The
 * session contract is imported from the settled contracts. Fixtures are
 * deliberately inert and fail closed.
 */
import type {
  AuthUser,
  Result,
  SessionAdapter,
  SessionIdentity,
  SessionManagementNamespace,
} from "./contracts";

/** Narrow authority a strategy receives while its namespace is constructed */
export type StrategyKernel<
  Identity extends SessionIdentity,
  SessionCreateResult,
> = {
  /** Establishes a session for exactly the user returned by a successful proof */
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
  /** Repeatable read-only resolution of the current identity */
  current: () => Promise<Identity | null>;
};

/** Auth surface produced by one kernel bound namespace map */
export type KernelMapAuth<
  Identity extends SessionIdentity,
  Capabilities extends object,
  Namespaces extends Record<string, object>,
> = {
  session: SessionManagementNamespace<Identity, Capabilities>;
  strategies: Namespaces;
};

/** Candidate constructor. Session adapter first, strategy map callback second */
export declare function makeAuth<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
  const Namespaces extends Record<string, object>,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
  strategies: (
    kernel: StrategyKernel<NoInfer<Identity>, NoInfer<SessionCreateResult>>,
  ) => Namespaces,
): KernelMapAuth<Identity, Capabilities, Namespaces>;

type SessionClaims = SessionIdentity & {
  role: "member" | "admin";
};

type CreatedSession = {
  accessToken: string;
  refreshToken: string;
};

type OtpUser = AuthUser & {
  identifier: string;
};

type OidcUser<Provider extends string> = AuthUser & {
  provider: Provider;
};

/** Complete OTP strategy dependency owned by the application or a shipped adapter */
export type OtpConfig = {
  request: (identifier: string) => Promise<Result<void, never>>;
  prove: (
    identifier: string,
    otp: string,
  ) => Promise<Result<OtpUser, "invalid_otp">>;
};

/** Public OTP workflows mounted under one caller chosen name */
export type OtpNamespace<SessionCreateResult> = {
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
  authenticate: (args: { identifier: string; otp: string }) => Promise<
    Result<
      {
        user: OtpUser;
        session: SessionCreateResult;
      },
      "invalid_otp"
    >
  >;
};

/** Complete OIDC strategy dependency owned by the application or a shipped adapter */
export type OidcConfig<Provider extends string> = {
  provider: Provider;
  begin: () => Promise<{ authorizationUrl: string }>;
  authenticate: (
    callbackUrl: string,
  ) => Promise<
    Result<OidcUser<Provider>, "invalid_state" | "authentication_failed">
  >;
};

/** Public OIDC workflows mounted under one caller chosen name */
export type OidcNamespace<Provider extends string, SessionCreateResult> = {
  begin: () => Promise<{ authorizationUrl: string; provider: Provider }>;
  callback: (args: { callbackUrl: string }) => Promise<
    Result<
      {
        user: OidcUser<Provider>;
        session: SessionCreateResult;
      },
      "invalid_state" | "authentication_failed"
    >
  >;
};

export function makeOtpNamespace<
  Identity extends SessionIdentity,
  SessionCreateResult,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: OtpConfig,
): OtpNamespace<SessionCreateResult> {
  return {
    request: ({ identifier }) => config.request(identifier),
    authenticate: ({ identifier, otp }) =>
      kernel.authenticate(() => config.prove(identifier, otp)),
  };
}

export function makeOidcNamespace<
  Identity extends SessionIdentity,
  SessionCreateResult,
  const Provider extends string,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: OidcConfig<Provider>,
): OidcNamespace<Provider, SessionCreateResult> {
  return {
    begin: async () => ({
      ...(await config.begin()),
      provider: config.provider,
    }),
    callback: ({ callbackUrl }) =>
      kernel.authenticate(() => config.authenticate(callbackUrl)),
  };
}

export const sessionCapabilities = {
  end: async () => undefined,
};

export const session = {
  kernel: {
    establish: async (userId: string) => ({
      accessToken: `access:${userId}`,
      refreshToken: `refresh:${userId}`,
    }),
    resolve: async (): Promise<SessionClaims | null> => null,
  },
  capabilities: sessionCapabilities,
} satisfies SessionAdapter<
  SessionClaims,
  CreatedSession,
  typeof sessionCapabilities
>;

export const emailOtpConfig = {
  request: async () => ({ success: true }),
  prove: async () => ({ success: false, error: "invalid_otp" }),
} satisfies OtpConfig;

export const smsOtpConfig = {
  request: async () => ({ success: true }),
  prove: async () => ({ success: false, error: "invalid_otp" }),
} satisfies OtpConfig;

export const googleProfileConfig = {
  provider: "google",
  begin: async () => ({ authorizationUrl: "https://google.example/auth" }),
  authenticate: async () => ({ success: false, error: "invalid_state" }),
} satisfies OidcConfig<"google">;

/** Shipped strategy bundle. Passed to makeAuth directly */
export function emailOtp<
  Identity extends SessionIdentity,
  SessionCreateResult,
>(kernel: StrategyKernel<Identity, SessionCreateResult>) {
  return { emailOtp: makeOtpNamespace(kernel, emailOtpConfig) };
}

/** Parameterized strategy bundle factory */
export function otpStrategy(config: OtpConfig) {
  return <Identity extends SessionIdentity, SessionCreateResult>(
    kernel: StrategyKernel<Identity, SessionCreateResult>,
  ) => ({ otp: makeOtpNamespace(kernel, config) });
}

export const auth = makeAuth(session, (kernel) => ({
  emailOtp: makeOtpNamespace(kernel, emailOtpConfig),
  smsOtp: makeOtpNamespace(kernel, smsOtpConfig),
  googleProfile: makeOidcNamespace(kernel, googleProfileConfig),
}));

export const bundleAuth = makeAuth(session, emailOtp);

export const parameterizedAuth = makeAuth(session, otpStrategy(smsOtpConfig));

export const extendedAuth = makeAuth(session, (kernel) => ({
  ...otpStrategy(emailOtpConfig)(kernel),
  googleProfile: makeOidcNamespace(kernel, googleProfileConfig),
}));

export const sessionOnlyAuth = makeAuth(session, () => ({}));

export const getSession = () => auth.session.get();

export const endSession = () => auth.session.end();

export const requestEmailOtp = (args: { identifier: string }) =>
  auth.strategies.emailOtp.request(args);

export const authenticateWithEmailOtp = (args: {
  identifier: string;
  otp: string;
}) => auth.strategies.emailOtp.authenticate(args);

export const requestSmsOtp = (args: { identifier: string }) =>
  auth.strategies.smsOtp.request(args);

export const beginGoogleSignIn = () => auth.strategies.googleProfile.begin();

export const completeGoogleSignIn = (args: { callbackUrl: string }) =>
  auth.strategies.googleProfile.callback(args);
