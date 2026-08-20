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

type OtpUser = AuthUser & {
  isNew: boolean;
};

type OtpArgs = {
  identifier: string;
  otp: string;
};

type RequestOtpArgs = {
  identifier: string;
};

type OtpError = "invalid_otp" | "authentication_disabled";

type OtpNamespace<SessionCreateResult> = {
  request: (args: RequestOtpArgs) => Promise<Result<void, never>>;
  authenticate: (args: OtpArgs) => Promise<
    Result<
      {
        user: OtpUser;
        session: SessionCreateResult;
      },
      OtpError
    >
  >;
};

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

async function proveOtp(args: OtpArgs): Promise<Result<OtpUser, OtpError>> {
  if (args.otp !== "123456") {
    return {
      success: false,
      error: "invalid_otp",
    };
  }

  return {
    success: true,
    data: {
      userId: `otp:${args.identifier}`,
      isNew: false,
    },
  };
}

async function requestOtp(args: RequestOtpArgs): Promise<Result<void, never>> {
  void args.identifier;
  return { success: true };
}

function makeOtpStrategy<Identity extends AuthUser, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return {
    otp: {
      request: requestOtp,
      authenticate: (args: OtpArgs) =>
        kernel.authenticate(() => proveOtp(args)),
    },
  };
}

function expectType<T>(value: T): T {
  return value;
}

const cookieAuth = makeAuth({ session: cookieSession }).addStrategy(
  makeOtpStrategy,
);
const headerAuth = makeAuth({ session: headerSession }).addStrategy(
  makeOtpStrategy,
);

expectType<OtpNamespace<CookieSessionResult>>(cookieAuth.strategies.otp);
expectType<OtpNamespace<HeaderSessionResult>>(headerAuth.strategies.otp);

const authenticateWithCookie = cookieAuth.strategies.otp.authenticate;
const authenticateWithHeader = headerAuth.strategies.otp.authenticate;

const cookieAuthentication = await authenticateWithCookie({
  identifier: "person@example.com",
  otp: "123456",
});
const headerAuthentication = await authenticateWithHeader({
  identifier: "person@example.com",
  otp: "123456",
});

if (
  !cookieAuthentication.success ||
  !("data" in cookieAuthentication) ||
  cookieAuthentication.data.session.cookie.value !==
    "cookie:otp:person@example.com"
) {
  throw new Error("Cookie strategy received the wrong session result");
}

if (
  !headerAuthentication.success ||
  !("data" in headerAuthentication) ||
  headerAuthentication.data.session.accessToken !==
    "access:otp:person@example.com"
) {
  throw new Error("Header strategy received the wrong session result");
}

if (false) {
  // @ts-expect-error An installed namespace cannot be added again.
  void cookieAuth.addStrategy(makeOtpStrategy);
}
