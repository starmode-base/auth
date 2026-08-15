/** Compile time probes for three reusable strategy encodings. */
import type {
  AuthUser,
  CookieSessionResult,
  HeaderSessionResult,
  Result,
  SessionIdentity,
  SessionPort,
} from "./contracts";
import {
  authenticationOperation,
  currentUserOperation,
  installStrategy,
  publicOperation,
} from "./operation-descriptor";
import type { StrategyDefinition } from "./operation-descriptor";
import { makeAuth as makeOperationBuilderAuth } from "./operation-builder";
import {
  defineStrategy,
  installDefinedStrategy,
} from "./define-strategy";
import type { StrategyApiTemplate } from "./define-strategy";
import { installUniversalStrategy } from "./universal-session-result";
import type {
  IssuedSessionCredentials,
  UniversalSessionPort,
  UniversalStrategy,
} from "./universal-session-result";

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
  request: (
    args: RequestOtpArgs,
  ) => Promise<Result<void, never>>;
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

declare const cookieSession: SessionPort<
  SessionIdentity,
  CookieSessionResult
>;
declare const headerSession: SessionPort<
  SessionIdentity,
  HeaderSessionResult
>;
declare const requestOtp: (
  args: RequestOtpArgs,
) => Promise<Result<void, never>>;
declare const proveOtp: (
  args: OtpArgs,
) => Promise<Result<OtpUser, OtpError>>;

function expectType<T>(value: T): T {
  return value;
}

/*
 * Operation descriptors preserve both session results through one reusable
 * literal strategy definition.
 */

const describedOtp = {
  request: publicOperation(requestOtp),
  authenticate: authenticationOperation(proveOtp),
} satisfies StrategyDefinition;

const describedCookieOtp = installStrategy(cookieSession, describedOtp);
const describedHeaderOtp = installStrategy(headerSession, describedOtp);

expectType<OtpNamespace<CookieSessionResult>>(describedCookieOtp);
expectType<OtpNamespace<HeaderSessionResult>>(describedHeaderOtp);

/*
 * The accumulating builder applies the configured session result when the
 * same reusable strategy is installed.
 */

const describedCookieAuth = makeOperationBuilderAuth({
  session: cookieSession,
}).addStrategy("otp", describedOtp);
const describedHeaderAuth = makeOperationBuilderAuth({
  session: headerSession,
}).addStrategy("otp", describedOtp);

expectType<OtpNamespace<CookieSessionResult>>(
  describedCookieAuth.strategies.otp,
);
expectType<OtpNamespace<HeaderSessionResult>>(
  describedHeaderAuth.strategies.otp,
);

const describedCookieBuilderAuthentication =
  describedCookieAuth.strategies.otp.authenticate({
    identifier: "person@example.com",
    otp: "123456",
  });
const describedHeaderBuilderAuthentication =
  describedHeaderAuth.strategies.otp.authenticate({
    identifier: "person@example.com",
    otp: "123456",
  });

expectType<
  Promise<
    Result<
      {
        user: OtpUser;
        session: CookieSessionResult;
      },
      OtpError
    >
  >
>(describedCookieBuilderAuthentication);
expectType<
  Promise<
    Result<
      {
        user: OtpUser;
        session: HeaderSessionResult;
      },
      OtpError
    >
  >
>(describedHeaderBuilderAuthentication);

// @ts-expect-error An installed strategy name cannot be added again.
void describedCookieAuth.addStrategy("otp", describedOtp);

const describedCookieAuthentication = describedCookieOtp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
});
const describedHeaderAuthentication = describedHeaderOtp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
});

expectType<
  Promise<
    Result<
      {
        user: OtpUser;
        session: CookieSessionResult;
      },
      OtpError
    >
  >
>(describedCookieAuthentication);
expectType<
  Promise<
    Result<
      {
        user: OtpUser;
        session: HeaderSessionResult;
      },
      OtpError
    >
  >
>(describedHeaderAuthentication);

type PasskeySummary = {
  credentialId: string;
};

declare const listPasskeys: (
  user: AuthUser,
  args: Record<never, never>,
) => Promise<Result<PasskeySummary[], "listing_disabled">>;

const describedPasskeyManagement = {
  list: currentUserOperation(listPasskeys),
} satisfies StrategyDefinition;

const describedPasskeys = installStrategy(
  cookieSession,
  describedPasskeyManagement,
);

expectType<
  Promise<
    Result<
      PasskeySummary[],
      "listing_disabled" | "not_authenticated"
    >
  >
>(describedPasskeys.list({}));

const invalidDescription = {
  invalid: {
    kind: "authentication",
  },
};

// @ts-expect-error Every described operation requires its complete runner.
void installStrategy(cookieSession, invalidDescription);

/*
 * defineStrategy preserves both results but requires an explicit type
 * function and an opaque helper produced value.
 */

interface OtpApiTemplate extends StrategyApiTemplate {
  readonly type: OtpNamespace<this["sessionCreateResult"]>;
}

const definedOtp = defineStrategy<OtpApiTemplate>(
  (kernel) => ({
    request: requestOtp,
    authenticate: (args) =>
      kernel.authenticate(() => proveOtp(args)),
  }),
);

const definedCookieOtp = installDefinedStrategy(cookieSession, definedOtp);
const definedHeaderOtp = installDefinedStrategy(headerSession, definedOtp);

expectType<OtpNamespace<CookieSessionResult>>(definedCookieOtp);
expectType<OtpNamespace<HeaderSessionResult>>(definedHeaderOtp);

const plainGenericStrategy = {
  mount: <Identity extends AuthUser, SessionCreateResult>() => {
    void undefined satisfies Identity | SessionCreateResult | undefined;

    return {
      request: requestOtp,
    };
  },
};

// @ts-expect-error The opaque helper is mandatory for this encoding.
void installDefinedStrategy(cookieSession, plainGenericStrategy);

/*
 * One universal result removes the higher kinded relationship but requires
 * every mechanism to present exactly that result.
 */

type UniversalOtpNamespace = OtpNamespace<IssuedSessionCredentials>;

const universalOtp = {
  mount: (kernel) => ({
    request: requestOtp,
    authenticate: (args) =>
      kernel.authenticate(() => proveOtp(args)),
  }),
} satisfies UniversalStrategy<UniversalOtpNamespace>;

declare const universalCookieSession: UniversalSessionPort<SessionIdentity>;
declare const universalHeaderSession: UniversalSessionPort<SessionIdentity>;

const universalCookieOtp = installUniversalStrategy(
  universalCookieSession,
  universalOtp,
);
const universalHeaderOtp = installUniversalStrategy(
  universalHeaderSession,
  universalOtp,
);

expectType<UniversalOtpNamespace>(universalCookieOtp);
expectType<UniversalOtpNamespace>(universalHeaderOtp);

// @ts-expect-error A mechanism specific result must first be normalized.
void installUniversalStrategy(cookieSession, universalOtp);

// @ts-expect-error A mechanism specific result must first be normalized.
void installUniversalStrategy(headerSession, universalOtp);
