/**
 * Compile-time proofs for the usage API candidate.
 *
 * This file is compiled and never executed. Each @ts-expect-error proves that
 * an unsupported configuration, namespace, or public method remains
 * unavailable.
 */
import type {
  AuthUser,
  OtpNamespace,
  PasskeyNamespace,
  Result,
  SessionAdapter,
  SessionIdentity,
  StrategyKernel,
  WithOtpConfig,
  WithPasskeyConfig,
} from "./contracts";
import { makeAuth } from "./contracts";

type SessionClaims = SessionIdentity & {
  role: "member";
};

type SessionCreated = {
  accessToken: "created";
};

type SessionRefreshed = {
  accessToken: "refreshed";
};

type ListedSession = {
  sessionId: string;
  device: string;
};

type SessionCapabilities = {
  refresh: (credential: string | null) => Promise<SessionRefreshed>;
  end: (credential: string | null) => Promise<void>;
  list: (credential: string | null) => Promise<ListedSession[]>;
};

type ResolvedUser = AuthUser & {
  isNew: boolean;
};

declare const session: SessionAdapter<
  SessionClaims,
  SessionCreated,
  SessionCapabilities
>;
declare const otp: WithOtpConfig<ResolvedUser>;
declare const passkey: WithPasskeyConfig;
declare const registrationResponse: RegistrationResponseJSON;

declare function makeOtpStrategy<
  Identity extends SessionIdentity,
  SessionCreateResult,
  User extends AuthUser,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: WithOtpConfig<User>,
): OtpNamespace<User, SessionCreateResult>;

declare function makePasskeyStrategy<
  Identity extends SessionIdentity,
  SessionCreateResult,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: WithPasskeyConfig,
): PasskeyNamespace<SessionCreateResult>;

function expectType<T>(value: T): T {
  return value;
}

/* Construction is one shot; strategies mount under caller chosen names. */

const auth = makeAuth(session, (kernel) => ({
  otp: makeOtpStrategy(kernel, otp),
  passkeys: makePasskeyStrategy(kernel, passkey),
}));

const sessionOnly = makeAuth(session, () => ({}));

expectType<OtpNamespace<ResolvedUser, SessionCreated>>(auth.strategies.otp);
expectType<PasskeyNamespace<SessionCreated>>(auth.strategies.passkeys);

// @ts-expect-error an unconfigured namespace is unavailable
void auth.strategies.google;

// @ts-expect-error the empty map exposes no strategy namespace
void sessionOnly.strategies.otp;

// @ts-expect-error strategies are nested under strategies
void auth.otp;

/* A generic strategy bundle passed as its own argument keeps exact types. */

function otpBundle<Identity extends SessionIdentity, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return { otp: makeOtpStrategy(kernel, otp) };
}

const bundleAuth = makeAuth(session, otpBundle);

expectType<OtpNamespace<ResolvedUser, SessionCreated>>(
  bundleAuth.strategies.otp,
);

/* The session namespace is reads plus the configured capabilities. */

expectType<Promise<SessionClaims | null>>(auth.session.get("token"));
expectType<Promise<SessionClaims | null>>(auth.session.get(null));
expectType<Promise<SessionRefreshed>>(auth.session.refresh("token"));
expectType<Promise<void>>(auth.session.end("token"));
expectType<Promise<ListedSession[]>>(auth.session.list(null));

// @ts-expect-error get requires the presented credential
void auth.session.get();

// @ts-expect-error direct session creation does not exist
void auth.session.create;

// @ts-expect-error direct session creation does not exist in the empty map
void sessionOnly.session.create;

// @ts-expect-error there is no accumulating builder
void auth.withOtp;

// @ts-expect-error there is no accumulating builder
void auth.withPasskey;

/* A capability cannot replace the kernel's read projection. */

const sessionWithPublicGet = {
  kernel: session.kernel,
  capabilities: {
    get: async () => null,
  },
};

// @ts-expect-error capabilities cannot shadow the kernel's read projection
void makeAuth(sessionWithPublicGet, () => ({}));

/* Fresh unknown adapter properties are rejected. */

void makeAuth(
  {
    kernel: session.kernel,
    capabilities: session.capabilities,
    // @ts-expect-error unknown adapter configuration is rejected
    unknown: true,
  },
  () => ({}),
);

/* Invalid namespace values are rejected at the callback. */

// @ts-expect-error every public namespace must be an object
void makeAuth(session, () => ({ invalid: 1 }));

/* The strategy kernel grants authentication and current authority only. */

declare const kernel: StrategyKernel<SessionClaims, SessionCreated>;

expectType<Promise<SessionClaims | null>>(kernel.current("token"));

// @ts-expect-error current requires the presented credential
void kernel.current();

// @ts-expect-error the kernel never exposes establishment directly
void kernel.establish;

declare const prove: () => Promise<Result<ResolvedUser, "invalid_otp">>;

async function kernelProbe(): Promise<void> {
  const outcome = await kernel.authenticate(prove);

  if (outcome.success) {
    expectType<ResolvedUser>(outcome.data.user);
    expectType<SessionCreated>(outcome.data.session);
  } else {
    expectType<"invalid_otp">(outcome.error);
  }
}

void kernelProbe;

/* OTP authentication combines the strategy user with the created session. */

async function otpProbe(): Promise<void> {
  const outcome = await auth.strategies.otp.authenticate({
    identifier: "person@example.com",
    otp: "123456",
  });

  if (outcome.success) {
    expectType<boolean>(outcome.data.user.isNew);
    expectType<SessionCreated>(outcome.data.session);
  }
}

void otpProbe;

/* Passkey current-user operations receive the token first, positionally. */

void auth.strategies.passkeys.createAdditionalRegistrationOptions("token");
void auth.strategies.passkeys.createAdditionalRegistrationOptions(null);
void auth.strategies.passkeys.verifyRegistration(null, {
  credential: registrationResponse,
});

// @ts-expect-error completing registration requires the token first
void auth.strategies.passkeys.verifyRegistration({
  credential: registrationResponse,
});

/* Credential management is application storage, not library surface. */

// @ts-expect-error stored passkeys are listed storage-direct by the app
void auth.strategies.passkeys.list;

// @ts-expect-error stored passkeys are removed storage-direct by the app
void auth.strategies.passkeys.remove;

/* Public methods accept values, never framework contexts. */

void auth.strategies.otp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
  // @ts-expect-error authentication receives no public context
  context: {},
});
