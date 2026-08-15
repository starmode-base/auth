import type {
  AuthUser,
  CookieSessionResult,
  HeaderSessionResult,
  Result,
  SessionIdentity,
  SessionPort,
  StrategyKernel,
} from "./contracts";
import { makeAuth } from "./kernel-map";

type InstanceConfig<Kind extends string, Details extends object> = {
  kind: Kind;
  details: Details;
  expectedProof: string;
};

type InstanceUser<Kind extends string, Details extends object> = AuthUser & {
  kind: Kind;
  details: Details;
};

type InstanceNamespace<
  Identity extends AuthUser,
  Kind extends string,
  Details extends object,
  SessionCreateResult,
> = {
  authenticate: (args: { identifier: string; proof: string }) => Promise<
    Result<
      {
        user: InstanceUser<Kind, Details>;
        session: SessionCreateResult;
      },
      "invalid_proof"
    >
  >;
  current: () => Promise<Identity | null>;
};

const emailOtpConfig = {
  kind: "otp",
  details: {
    channel: "email",
  },
  expectedProof: "email-otp",
} satisfies InstanceConfig<"otp", { channel: "email" }>;

const smsOtpConfig = {
  kind: "otp",
  details: {
    channel: "sms",
  },
  expectedProof: "sms-otp",
} satisfies InstanceConfig<"otp", { channel: "sms" }>;

const googleProfileConfig = {
  kind: "oidc",
  details: {
    provider: "google",
    scopes: ["openid", "profile"],
  },
  expectedProof: "google-profile-callback",
} satisfies InstanceConfig<
  "oidc",
  {
    provider: "google";
    scopes: ["openid", "profile"];
  }
>;

const googleCalendarConfig = {
  kind: "oidc",
  details: {
    provider: "google",
    scopes: ["openid", "calendar"],
  },
  expectedProof: "google-calendar-callback",
} satisfies InstanceConfig<
  "oidc",
  {
    provider: "google";
    scopes: ["openid", "calendar"];
  }
>;

function makeInstanceNamespace<
  Identity extends AuthUser,
  SessionCreateResult,
  const Kind extends string,
  const Details extends object,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: InstanceConfig<Kind, Details>,
): InstanceNamespace<Identity, Kind, Details, SessionCreateResult> {
  return {
    authenticate: (args) =>
      kernel.authenticate(async () => {
        if (args.proof !== config.expectedProof) {
          return {
            success: false,
            error: "invalid_proof",
          };
        }

        return {
          success: true,
          data: {
            userId: `${config.kind}:${args.identifier}`,
            kind: config.kind,
            details: config.details,
          },
        };
      }),
    current: () => kernel.current(),
  };
}

function makeOtpNamespaces<Identity extends AuthUser, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return {
    emailOtp: makeInstanceNamespace(kernel, emailOtpConfig),
    smsOtp: makeInstanceNamespace(kernel, smsOtpConfig),
  };
}

function makeOidcNamespaces<Identity extends AuthUser, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return {
    googleProfile: makeInstanceNamespace(kernel, googleProfileConfig),
    googleCalendar: makeInstanceNamespace(kernel, googleCalendarConfig),
  };
}

function makeAllNamespaces<Identity extends AuthUser, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return {
    ...makeOtpNamespaces(kernel),
    ...makeOidcNamespaces(kernel),
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

const cookieAuth = makeAuth({
  session: cookieSession,
  strategies: makeAllNamespaces,
});
const headerAuth = makeAuth({
  session: headerSession,
  strategies: makeAllNamespaces,
});

expectType<
  InstanceNamespace<
    SessionIdentity,
    "otp",
    { channel: "email" },
    CookieSessionResult
  >
>(cookieAuth.strategies.emailOtp);
expectType<
  InstanceNamespace<
    SessionIdentity,
    "oidc",
    {
      provider: "google";
      scopes: ["openid", "calendar"];
    },
    HeaderSessionResult
  >
>(headerAuth.strategies.googleCalendar);
expectType<Promise<SessionIdentity | null>>(cookieAuth.session.get());

// @ts-expect-error An unconfigured namespace is unavailable.
void cookieAuth.strategies.github;

// @ts-expect-error Strategy arguments retain their exact shape.
void cookieAuth.strategies.emailOtp.authenticate({ identifier: "person" });

const emptyAuth = makeAuth({
  session: cookieSession,
  strategies: () => ({}),
});

// @ts-expect-error The empty map exposes no strategy namespace.
void emptyAuth.strategies.otp;

const spreadAuth = makeAuth({
  session: cookieSession,
  strategies: (kernel) => ({
    ...makeOtpNamespaces(kernel),
    ...makeOidcNamespaces(kernel),
  }),
});

expectType<
  InstanceNamespace<
    SessionIdentity,
    "otp",
    { channel: "sms" },
    CookieSessionResult
  >
>(spreadAuth.strategies.smsOtp);

const replacementAuth = makeAuth({
  session: cookieSession,
  strategies: (kernel) => ({
    ...makeOtpNamespaces(kernel),
    emailOtp: makeInstanceNamespace(kernel, smsOtpConfig),
  }),
});

expectType<
  InstanceNamespace<
    SessionIdentity,
    "otp",
    { channel: "sms" },
    CookieSessionResult
  >
>(replacementAuth.strategies.emailOtp);

const checkedAuth = makeAuth({
  session: cookieSession,
  strategies: (kernel) =>
    ({
      emailOtp: makeInstanceNamespace(kernel, emailOtpConfig),
    }) satisfies Record<string, object>,
});

expectType<
  InstanceNamespace<
    SessionIdentity,
    "otp",
    { channel: "email" },
    CookieSessionResult
  >
>(checkedAuth.strategies.emailOtp);

// @ts-expect-error satisfies retains the exact configured keys.
void checkedAuth.strategies.notInstalled;

const widenedAuth = makeAuth({
  session: cookieSession,
  strategies: (kernel) => {
    const widened: Record<string, object> = {
      emailOtp: makeInstanceNamespace(kernel, emailOtpConfig),
    };

    return widened;
  },
});

expectType<object | undefined>(widenedAuth.strategies.notInstalled);

if (false) {
  void makeAuth({
    session: cookieSession,
    // @ts-expect-error Every namespace must be an object.
    strategies: () => ({ invalid: 1 }),
  });

  void makeAuth({
    session: cookieSession,
    strategies: () => ({}),
    // @ts-expect-error Unknown root configuration is rejected.
    unknown: true,
  });
}

const cookieAuthentication = await cookieAuth.strategies.emailOtp.authenticate({
  identifier: "person@example.com",
  proof: "email-otp",
});
const headerAuthentication =
  await headerAuth.strategies.googleCalendar.authenticate({
    identifier: "person@example.com",
    proof: "google-calendar-callback",
  });

if (
  !cookieAuthentication.success ||
  !("data" in cookieAuthentication) ||
  cookieAuthentication.data.user.details.channel !== "email" ||
  cookieAuthentication.data.session.cookie.value !==
    "cookie:otp:person@example.com"
) {
  throw new Error("The map lost the cookie strategy types");
}

if (
  !headerAuthentication.success ||
  !("data" in headerAuthentication) ||
  headerAuthentication.data.user.details.scopes[1] !== "calendar" ||
  headerAuthentication.data.session.accessToken !==
    "access:oidc:person@example.com"
) {
  throw new Error("The map lost the header strategy types");
}
