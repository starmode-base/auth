/**
 * Compile-time proofs for the public contracts.
 *
 * This file is compiled and never executed. Each expected error proves that an
 * unsupported configuration, namespace, or public operation remains absent.
 */
import type {
  AuthUser,
  OtpEngine,
  OtpStrategy,
  PasskeyEngine,
  PasskeyRegistrationCredential,
  PasskeyStrategy,
  RegisteredPasskeyUser,
  Result,
  SessionAdapter,
  SessionIdentity,
  StrategyKernel,
} from "./contracts";
import { makeAuth } from "./make-auth";
import { makeOtpStrategy } from "./mechanisms/make-otp-strategy";
import { makePasskeyStrategy } from "./mechanisms/make-passkey-strategy";

function expectType<T>(value: T): T {
  return value;
}

declare const payloadSuccess: Result<{ userId: string }, never>;

const payloadEnvelope: {
  success: true;
  data: { userId: string };
} = payloadSuccess;
void payloadEnvelope;

// @ts-expect-error A success payload is nested in data.
void payloadSuccess.userId;

declare const voidSuccess: Result<void, never>;

const voidEnvelope: { success: true } = voidSuccess;
void voidEnvelope;

// @ts-expect-error A void success has no data.
void voidSuccess.data;

declare const fallible: Result<
  { userId: string },
  "authentication_disabled" | "invalid_otp"
>;

// @ts-expect-error Data requires success narrowing.
void fallible.data;

// @ts-expect-error Error requires failure narrowing.
void fallible.error;

if (fallible.success) {
  const userId: string = fallible.data.userId;
  void userId;

  // @ts-expect-error The success branch has no error.
  void fallible.error;
} else {
  const error: "authentication_disabled" | "invalid_otp" = fallible.error;
  void error;

  // @ts-expect-error The failure branch has no data.
  void fallible.data;
}

type SessionClaims = SessionIdentity & {
  role: "member";
};

type SessionCredential = {
  accessToken: "created";
};

type RefreshedCredential = {
  accessToken: "refreshed";
};

type SessionCapabilities = {
  refresh: (token: string) => Promise<RefreshedCredential>;
  end: (token: string | null) => Promise<void>;
};

type ResolvedUser = AuthUser & {
  isNew: boolean;
};

declare const session: SessionAdapter<
  SessionClaims,
  SessionCredential,
  SessionCapabilities
>;
declare const otpEngine: OtpEngine<ResolvedUser>;
declare const passkeyEngine: PasskeyEngine;
declare const registrationCredential: PasskeyRegistrationCredential;

const auth = makeAuth(session, (kernel) => ({
  otp: makeOtpStrategy(kernel, otpEngine),
  passkeys: makePasskeyStrategy(kernel, passkeyEngine),
}));

const sessionOnly = makeAuth(session, () => ({}));

expectType<OtpStrategy<ResolvedUser, SessionCredential>>(auth.strategies.otp);
expectType<PasskeyStrategy<SessionCredential>>(auth.strategies.passkeys);

// @ts-expect-error An unconfigured namespace is unavailable.
void auth.strategies.google;

// @ts-expect-error An empty map exposes no strategy namespace.
void sessionOnly.strategies.otp;

// @ts-expect-error Strategies remain nested under strategies.
void auth.otp;

function otpBundle<Identity extends SessionIdentity, Credential>(
  kernel: StrategyKernel<Identity, Credential>,
) {
  return { otp: makeOtpStrategy(kernel, otpEngine) };
}

const bundleAuth = makeAuth(session, otpBundle);

expectType<OtpStrategy<ResolvedUser, SessionCredential>>(
  bundleAuth.strategies.otp,
);

expectType<Promise<SessionClaims | null>>(auth.session.get("token"));
expectType<Promise<SessionClaims | null>>(auth.session.get(null));
expectType<Promise<RefreshedCredential>>(auth.session.refresh("refresh-token"));
expectType<Promise<void>>(auth.session.end(null));

// @ts-expect-error get requires the presented token.
void auth.session.get();

// @ts-expect-error Direct session establishment is not public.
void auth.session.establish;

// @ts-expect-error Direct session establishment is absent with an empty map.
void sessionOnly.session.establish;

// @ts-expect-error There is no accumulating builder.
void auth.withOtp;

const sessionWithPublicGet = {
  kernel: session.kernel,
  capabilities: {
    get: async () => null,
  },
};

// @ts-expect-error Capabilities cannot replace the read projection.
void makeAuth(sessionWithPublicGet, () => ({}));

void makeAuth(
  {
    kernel: session.kernel,
    capabilities: session.capabilities,
    // @ts-expect-error Unknown adapter properties are rejected.
    unknown: true,
  },
  () => ({}),
);

// @ts-expect-error Every public namespace must be an object.
void makeAuth(session, () => ({ invalid: 1 }));

declare const kernel: StrategyKernel<SessionClaims, SessionCredential>;
declare const prove: () => Promise<Result<ResolvedUser, "invalid_otp">>;

expectType<Promise<SessionClaims | null>>(kernel.current("token"));

// @ts-expect-error current requires the presented token.
void kernel.current();

// @ts-expect-error Strategies never receive establishment directly.
void kernel.establish;

async function kernelProbe(): Promise<void> {
  const outcome = await kernel.authenticate(prove);

  if (outcome.success) {
    expectType<ResolvedUser>(outcome.data.user);
    expectType<SessionCredential>(outcome.data.session);
  } else {
    expectType<"invalid_otp">(outcome.error);
  }
}

void kernelProbe;

async function otpProbe(): Promise<void> {
  const outcome = await auth.strategies.otp.authenticate({
    identifier: "person@example.com",
    otp: "123456",
  });

  if (outcome.success) {
    expectType<boolean>(outcome.data.user.isNew);
    expectType<SessionCredential>(outcome.data.session);
  }
}

void otpProbe;

declare const registrationProof: Awaited<
  ReturnType<PasskeyEngine["verifyRegistration"]>
>;

if (registrationProof.success) {
  expectType<RegisteredPasskeyUser>(registrationProof.data);

  // @ts-expect-error An engine proof never establishes a session.
  void registrationProof.data.session;
}

declare const authenticationProof: Awaited<
  ReturnType<PasskeyEngine["verifyAuthentication"]>
>;

if (authenticationProof.success) {
  expectType<AuthUser>(authenticationProof.data);

  // @ts-expect-error An engine proof never establishes a session.
  void authenticationProof.data.session;
}

void auth.strategies.passkeys.createVouchedRegistrationOptions({
  userId: "vouched-user",
});
void auth.strategies.passkeys.createAdditionalRegistrationOptions("token");
void auth.strategies.passkeys.verifyRegistration(null, {
  credential: registrationCredential,
});

// @ts-expect-error Registration completion requires the token first.
void auth.strategies.passkeys.verifyRegistration({
  credential: registrationCredential,
});

// @ts-expect-error Stored passkeys are listed directly from application storage.
void auth.strategies.passkeys.list;

// @ts-expect-error Stored passkeys are removed directly from application storage.
void auth.strategies.passkeys.remove;

void auth.strategies.otp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
  // @ts-expect-error Public operations receive values, not framework contexts.
  context: {},
});

type EmailOtpUser = AuthUser & {
  channel: "email";
};

type SmsOtpUser = AuthUser & {
  channel: "sms";
};

type ThirdPartyConfig<
  Provider extends string,
  Scopes extends readonly string[],
> = {
  provider: Provider;
  scopes: Scopes;
};

type ThirdPartyStrategy<
  Provider extends string,
  Scopes extends readonly string[],
  Credential,
> = {
  begin: () => Promise<{ provider: Provider; scopes: Scopes }>;
  authenticate: () => Promise<
    Result<
      {
        user: AuthUser & { provider: Provider; scopes: Scopes };
        session: Credential;
      },
      "authentication_failed"
    >
  >;
};

declare function makeThirdPartyStrategy<
  Identity extends SessionIdentity,
  Credential,
  const Provider extends string,
  const Scopes extends readonly string[],
>(
  kernel: StrategyKernel<Identity, Credential>,
  config: ThirdPartyConfig<Provider, Scopes>,
): ThirdPartyStrategy<Provider, Scopes, Credential>;

declare const emailOtpEngine: OtpEngine<EmailOtpUser>;
declare const smsOtpEngine: OtpEngine<SmsOtpUser>;
declare const googleCalendar: ThirdPartyConfig<
  "google",
  readonly ["openid", "calendar"]
>;

function reusableStrategies<Identity extends SessionIdentity, Credential>(
  strategyKernel: StrategyKernel<Identity, Credential>,
) {
  return {
    emailOtp: makeOtpStrategy(strategyKernel, emailOtpEngine),
    smsOtp: makeOtpStrategy(strategyKernel, smsOtpEngine),
    googleCalendar: makeThirdPartyStrategy(strategyKernel, googleCalendar),
  };
}

type CookieCredential = {
  cookie: string;
};

type HeaderCredential = {
  accessToken: string;
  refreshToken: string;
};

declare const cookieSession: SessionAdapter<SessionClaims, CookieCredential, {}>;
declare const headerSession: SessionAdapter<SessionClaims, HeaderCredential, {}>;

const cookieAuth = makeAuth(cookieSession, reusableStrategies);
const headerAuth = makeAuth(headerSession, reusableStrategies);

expectType<OtpStrategy<EmailOtpUser, CookieCredential>>(
  cookieAuth.strategies.emailOtp,
);
expectType<OtpStrategy<SmsOtpUser, CookieCredential>>(
  cookieAuth.strategies.smsOtp,
);
expectType<
  ThirdPartyStrategy<
    "google",
    readonly ["openid", "calendar"],
    CookieCredential
  >
>(cookieAuth.strategies.googleCalendar);
expectType<
  ThirdPartyStrategy<
    "google",
    readonly ["openid", "calendar"],
    HeaderCredential
  >
>(headerAuth.strategies.googleCalendar);
