/**
 * Framework-neutral playground for the promoted usage API.
 *
 * makeAuth receives the session adapter and one strategy map callback. The
 * callback receives the narrow strategy kernel and returns the final named
 * namespace map. The public surface nests every strategy under
 * auth.strategies, while auth.session carries reads plus the configured
 * mechanism capabilities. Direct session creation does not exist. Bespoke
 * authentication is an explicit strategy.
 *
 * auth is a module singleton. Construction touches no request. Every
 * operation that uses current session authority receives the presented
 * credential as an argument. Created credentials remain mechanism defined
 * values that the application writes back.
 *
 * Strategy bundles are functions of the kernel. A bundle passed directly,
 * a parameterized bundle factory, and a hand written callback that spreads
 * a bundle's result are the same API at three levels of granularity.
 * Fixtures are deliberately inert and fail closed.
 */
import type {
  AuthUser,
  OtpNamespace,
  Result,
  SessionAdapter,
  SessionIdentity,
  StrategyKernel,
  WithOtpConfig,
} from "./contracts";
import { makeAuth } from "./make-auth-sandbox";

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

export function makeOtpStrategy<
  Identity extends SessionIdentity,
  SessionCreateResult,
  User extends AuthUser,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: WithOtpConfig<User>,
): OtpNamespace<User, SessionCreateResult> {
  return {
    request: (args) => config.request(args),
    authenticate: (args) =>
      kernel.authenticate(() => config.authenticate(args)),
  };
}

export function makeOidcStrategy<
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
  end: async (credential: string | null) => {
    void credential;
  },
};

export const session = {
  kernel: {
    establish: async (userId: string) => ({
      accessToken: `access:${userId}`,
      refreshToken: `refresh:${userId}`,
    }),
    resolve: async (
      credential: string | null,
    ): Promise<SessionClaims | null> => {
      void credential;
      return null;
    },
  },
  capabilities: sessionCapabilities,
} satisfies SessionAdapter<
  SessionClaims,
  CreatedSession,
  typeof sessionCapabilities
>;

export const emailOtpConfig = {
  request: async () => ({ success: true }),
  authenticate: async (): Promise<Result<OtpUser, "invalid_otp">> => ({
    success: false,
    error: "invalid_otp",
  }),
} satisfies WithOtpConfig<OtpUser>;

export const smsOtpConfig = {
  request: async () => ({ success: true }),
  authenticate: async (): Promise<Result<OtpUser, "invalid_otp">> => ({
    success: false,
    error: "invalid_otp",
  }),
} satisfies WithOtpConfig<OtpUser>;

export const googleProfileConfig = {
  provider: "google",
  begin: async () => ({ authorizationUrl: "https://google.example/auth" }),
  authenticate: async () => ({ success: false, error: "invalid_state" }),
} satisfies OidcConfig<"google">;

/** Shipped strategy bundle. Passed to makeAuth directly */
export function emailOtp<Identity extends SessionIdentity, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return { emailOtp: makeOtpStrategy(kernel, emailOtpConfig) };
}

/** Parameterized strategy bundle factory */
export function otpStrategy(config: WithOtpConfig<OtpUser>) {
  return <Identity extends SessionIdentity, SessionCreateResult>(
    kernel: StrategyKernel<Identity, SessionCreateResult>,
  ) => ({ otp: makeOtpStrategy(kernel, config) });
}

export const auth = makeAuth(session, (kernel) => ({
  emailOtp: makeOtpStrategy(kernel, emailOtpConfig),
  smsOtp: makeOtpStrategy(kernel, smsOtpConfig),
  googleProfile: makeOidcStrategy(kernel, googleProfileConfig),
}));

export const bundleAuth = makeAuth(session, emailOtp);

export const parameterizedAuth = makeAuth(session, otpStrategy(smsOtpConfig));

export const extendedAuth = makeAuth(session, (kernel) => ({
  ...otpStrategy(emailOtpConfig)(kernel),
  googleProfile: makeOidcStrategy(kernel, googleProfileConfig),
}));

export const sessionOnlyAuth = makeAuth(session, () => ({}));

export const getSession = (token: string | null) => auth.session.get(token);

export const endSession = (token: string | null) => auth.session.end(token);

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
