import type {
  AuthUser,
  CookieSessionResult,
  HeaderSessionResult,
  Result,
  SessionIdentity,
  SessionPort,
  StrategyKernel,
} from "./contracts";
import { makeAuth } from "./namespace-factory";

type OtpConfig<Channel extends string> = {
  channel: Channel;
  expectedOtp: string;
};

type OtpUser<Channel extends string> = AuthUser & {
  channel: Channel;
};

type OtpNamespace<
  Channel extends string,
  SessionCreateResult,
> = {
  request: (args: {
    identifier: string;
  }) => Promise<Result<void, never>>;
  authenticate: (args: {
    identifier: string;
    otp: string;
  }) => Promise<
    Result<
      {
        user: OtpUser<Channel>;
        session: SessionCreateResult;
      },
      "invalid_otp"
    >
  >;
};

type OidcConfig<
  Provider extends string,
  Scopes extends readonly string[],
> = {
  provider: Provider;
  clientId: string;
  scopes: Scopes;
};

type OidcUser<
  Provider extends string,
  Scopes extends readonly string[],
> = AuthUser & {
  provider: Provider;
  scopes: Scopes;
};

type OidcNamespace<
  Provider extends string,
  Scopes extends readonly string[],
  SessionCreateResult,
> = {
  begin: () => Promise<{
    authorizationUrl: string;
    provider: Provider;
    scopes: Scopes;
  }>;
  callback: (args: { callbackUrl: string }) => Promise<
    Result<
      {
        user: OidcUser<Provider, Scopes>;
        session: SessionCreateResult;
      },
      "invalid_callback"
    >
  >;
};

const emailOtpConfig = {
  channel: "email",
  expectedOtp: "email-otp",
} satisfies OtpConfig<"email">;

const smsOtpConfig = {
  channel: "sms",
  expectedOtp: "sms-otp",
} satisfies OtpConfig<"sms">;

const googleProfileConfig = {
  provider: "google",
  clientId: "google-profile-client",
  scopes: ["openid", "profile"],
} satisfies OidcConfig<"google", ["openid", "profile"]>;

const googleCalendarConfig = {
  provider: "google",
  clientId: "google-calendar-client",
  scopes: ["openid", "calendar"],
} satisfies OidcConfig<"google", ["openid", "calendar"]>;

function makeOtpNamespace<
  Identity extends AuthUser,
  SessionCreateResult,
  const Channel extends string,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: OtpConfig<Channel>,
): OtpNamespace<Channel, SessionCreateResult> {
  return {
    request: async ({ identifier }) => {
      void identifier;
      return { success: true };
    },
    authenticate: (args) =>
      kernel.authenticate(async () => {
        if (args.otp !== config.expectedOtp) {
          return {
            success: false,
            error: "invalid_otp",
          };
        }

        return {
          success: true,
          data: {
            userId: `${config.channel}:${args.identifier}`,
            channel: config.channel,
          },
        };
      }),
  };
}

function makeOidcNamespace<
  Identity extends AuthUser,
  SessionCreateResult,
  const Provider extends string,
  const Scopes extends readonly string[],
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: OidcConfig<Provider, Scopes>,
): OidcNamespace<Provider, Scopes, SessionCreateResult> {
  return {
    begin: async () => ({
      authorizationUrl: `https://${config.provider}.example/authorize?client_id=${config.clientId}`,
      provider: config.provider,
      scopes: config.scopes,
    }),
    callback: ({ callbackUrl }) =>
      kernel.authenticate(async () => {
        if (!callbackUrl.includes("state=valid")) {
          return {
            success: false,
            error: "invalid_callback",
          };
        }

        return {
          success: true,
          data: {
            userId: `${config.clientId}:user`,
            provider: config.provider,
            scopes: config.scopes,
          },
        };
      }),
  };
}

function makeEmailOtpStrategy<
  Identity extends AuthUser,
  SessionCreateResult,
>(kernel: StrategyKernel<Identity, SessionCreateResult>) {
  return {
    emailOtp: makeOtpNamespace(kernel, emailOtpConfig),
  };
}

function makeSmsOtpStrategy<
  Identity extends AuthUser,
  SessionCreateResult,
>(kernel: StrategyKernel<Identity, SessionCreateResult>) {
  return {
    smsOtp: makeOtpNamespace(kernel, smsOtpConfig),
  };
}

function makeGoogleProfileStrategy<
  Identity extends AuthUser,
  SessionCreateResult,
>(kernel: StrategyKernel<Identity, SessionCreateResult>) {
  return {
    googleProfile: makeOidcNamespace(kernel, googleProfileConfig),
  };
}

function makeGoogleCalendarStrategy<
  Identity extends AuthUser,
  SessionCreateResult,
>(kernel: StrategyKernel<Identity, SessionCreateResult>) {
  return {
    googleCalendar: makeOidcNamespace(kernel, googleCalendarConfig),
  };
}

const cookieSession = {
  establish: async (userId) => ({
    cookie: {
      name: "auth",
      value: `cookie:${userId}`,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  }),
  current: async () => ({
    userId: "current-cookie-user",
    role: "member",
  }),
} satisfies SessionPort<SessionIdentity, CookieSessionResult>;

const headerSession = {
  establish: async (userId) => ({
    accessToken: `access:${userId}`,
    refreshToken: `refresh:${userId}`,
  }),
  current: async () => ({
    userId: "current-header-user",
    role: "member",
  }),
} satisfies SessionPort<SessionIdentity, HeaderSessionResult>;

function expectType<T>(value: T): T {
  return value;
}

const cookieAuth = makeAuth({ session: cookieSession })
  .addStrategy(makeEmailOtpStrategy)
  .addStrategy(makeSmsOtpStrategy)
  .addStrategy(makeGoogleProfileStrategy)
  .addStrategy(makeGoogleCalendarStrategy);

const headerAuth = makeAuth({ session: headerSession })
  .addStrategy(makeEmailOtpStrategy)
  .addStrategy(makeSmsOtpStrategy)
  .addStrategy(makeGoogleProfileStrategy)
  .addStrategy(makeGoogleCalendarStrategy);

const inlineAuth = makeAuth({ session: cookieSession })
  .addStrategy((kernel) => ({
    loginByEmail: makeOtpNamespace(kernel, emailOtpConfig),
  }))
  .addStrategy((kernel) => ({
    googleWithCalendar: makeOidcNamespace(
      kernel,
      googleCalendarConfig,
    ),
  }));

expectType<OtpNamespace<"email", CookieSessionResult>>(
  cookieAuth.strategies.emailOtp,
);
expectType<OtpNamespace<"sms", HeaderSessionResult>>(
  headerAuth.strategies.smsOtp,
);
expectType<
  OidcNamespace<
    "google",
    ["openid", "profile"],
    CookieSessionResult
  >
>(cookieAuth.strategies.googleProfile);
expectType<
  OidcNamespace<
    "google",
    ["openid", "calendar"],
    HeaderSessionResult
  >
>(headerAuth.strategies.googleCalendar);
expectType<OtpNamespace<"email", CookieSessionResult>>(
  inlineAuth.strategies.loginByEmail,
);
expectType<
  OidcNamespace<
    "google",
    ["openid", "calendar"],
    CookieSessionResult
  >
>(inlineAuth.strategies.googleWithCalendar);

const emailAuthentication =
  await cookieAuth.strategies.emailOtp.authenticate({
    identifier: "person@example.com",
    otp: "email-otp",
  });
const smsAuthentication = await headerAuth.strategies.smsOtp.authenticate({
  identifier: "+15555550100",
  otp: "sms-otp",
});
const googleProfile = await cookieAuth.strategies.googleProfile.callback({
  callbackUrl: "https://app.example/callback?state=valid",
});
const googleCalendar =
  await headerAuth.strategies.googleCalendar.callback({
    callbackUrl: "https://app.example/callback?state=valid",
  });

if (
  !emailAuthentication.success ||
  !("data" in emailAuthentication) ||
  emailAuthentication.data.user.channel !== "email" ||
  emailAuthentication.data.session.cookie.value !==
    "cookie:email:person@example.com"
) {
  throw new Error("Email OTP namespace lost its instance types");
}

if (
  !smsAuthentication.success ||
  !("data" in smsAuthentication) ||
  smsAuthentication.data.user.channel !== "sms" ||
  smsAuthentication.data.session.accessToken !==
    "access:sms:+15555550100"
) {
  throw new Error("SMS OTP namespace lost its instance types");
}

if (
  !googleProfile.success ||
  !("data" in googleProfile) ||
  googleProfile.data.user.scopes[1] !== "profile" ||
  googleProfile.data.session.cookie.value !==
    "cookie:google-profile-client:user"
) {
  throw new Error("Google profile namespace lost its instance types");
}

if (
  !googleCalendar.success ||
  !("data" in googleCalendar) ||
  googleCalendar.data.user.scopes[1] !== "calendar" ||
  googleCalendar.data.session.accessToken !==
    "access:google-calendar-client:user"
) {
  throw new Error("Google calendar namespace lost its instance types");
}

if (false) {
  // @ts-expect-error An arbitrary installed namespace cannot be reused.
  void cookieAuth.addStrategy(makeEmailOtpStrategy);

  void cookieAuth.addStrategy(
    // @ts-expect-error A namespace from another strategy cannot collide.
    <Identity extends AuthUser, SessionCreateResult>(
      kernel: StrategyKernel<Identity, SessionCreateResult>,
    ) => ({
      googleProfile: makeOidcNamespace(
        kernel,
        googleCalendarConfig,
      ),
    }),
  );
}
