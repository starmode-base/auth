/**
 * Compile-time proofs for the usage API candidate.
 *
 * This file is compiled and never executed. Each @ts-expect-error proves that
 * an unsupported chain, configuration, or public method remains unavailable.
 */
import type {
  Auth,
  AuthFull,
  AuthOtp,
  AuthPasskey,
  AuthUser,
  ChallengeStorage,
  CredentialStorage,
  OtpDelivery,
  OtpStorage,
  PasskeyNamespace,
  SessionAdapter,
  SessionIdentity,
  SessionSummary,
  WebAuthnConfig,
  WithOtpConfig,
  WithPasskeyConfig,
} from "./contracts";
import { makeAuth } from "./contracts";

type SessionCreated = {
  accessToken: "created";
};

type SessionRefreshed = {
  accessToken: "refreshed";
};

type ListedSession = SessionSummary & {
  device: string;
};

type ResolvedUser = AuthUser & {
  isNew: boolean;
};

declare const session: SessionAdapter<
  SessionCreated,
  SessionRefreshed,
  ListedSession
>;
declare const otpStorage: OtpStorage;
declare const otpDelivery: OtpDelivery;
declare const credentialStorage: CredentialStorage;
declare const challengeStorage: ChallengeStorage;
declare const webAuthn: WebAuthnConfig;

const otp = {
  storage: otpStorage,
  delivery: otpDelivery,
  generateOtp: () => "123456",
  ttl: 600_000,
  authorizeRequest: async ({ identifier }) => identifier.length > 0,
  resolveUser: async ({ identifier }) => ({
    userId: identifier,
    isNew: true,
  }),
} satisfies WithOtpConfig<ResolvedUser>;

const passkey = {
  storage: credentialStorage,
  challenge: {
    storage: challengeStorage,
    ttl: 60_000,
  },
  webAuthn,
  generateChallenge: () => "challenge",
  createUser: async () => ({
    userId: "user-1",
    identifier: null,
  }),
  getUser: async (userId) => ({
    userId,
    identifier: null,
  }),
  authorizeRegistration: async ({ userId }) => userId.length > 0,
  authorizeAuthentication: async ({ userId }) => userId.length > 0,
  authorizeRemoval: async ({ credentialCount }) => credentialCount > 1,
  verifyRegistrationCredential: async () => null,
  verifyAuthenticationCredential: async () => null,
} satisfies WithPasskeyConfig;

function expectType<T>(value: T): T {
  return value;
}

const sessionOnly = makeAuth({ debug: true, session });
const sessionOtp = makeAuth({ debug: true, session }).withOtp(otp);
const sessionPasskey = makeAuth({ debug: true, session }).withPasskey(passkey);
const otpThenPasskey = makeAuth({ debug: true, session })
  .withOtp(otp)
  .withPasskey(passkey);
const passkeyThenOtp = makeAuth({ debug: true, session })
  .withPasskey(passkey)
  .withOtp(otp);

/* The four approved states preserve their exact types. */

expectType<Auth<SessionCreated, SessionRefreshed, ListedSession>>(sessionOnly);
expectType<
  AuthOtp<SessionCreated, SessionRefreshed, ListedSession, ResolvedUser>
>(sessionOtp);
expectType<AuthPasskey<SessionCreated, SessionRefreshed, ListedSession>>(
  sessionPasskey,
);
expectType<
  AuthFull<SessionCreated, SessionRefreshed, ListedSession, ResolvedUser>
>(otpThenPasskey);
expectType<
  AuthFull<SessionCreated, SessionRefreshed, ListedSession, ResolvedUser>
>(passkeyThenOtp);

/* makeAuth always requires sessions; withSession does not exist. */

// @ts-expect-error session is required
void makeAuth({ debug: true });

// @ts-expect-error debug is required
void makeAuth({ session });

// @ts-expect-error unknown base configuration is rejected
void makeAuth({ debug: true, session, unknown: true });

// @ts-expect-error sessions are configured at makeAuth
void sessionOnly.withSession;

/* Authentication strategies cannot exist outside session-based makeAuth. */

// @ts-expect-error there is no standalone chained OTP builder
void makeAuth({ debug: true }).withOtp(otp);

// @ts-expect-error there is no standalone chained passkey builder
void makeAuth({ debug: true }).withPasskey(passkey);

/* Strategies can be installed once, in either order. */

void sessionOnly.withOtp(otp);
void sessionOnly.withPasskey(passkey);
void sessionOtp.withPasskey(passkey);
void sessionPasskey.withOtp(otp);

// @ts-expect-error OTP is already installed
void sessionOtp.withOtp;

// @ts-expect-error passkeys are already installed
void sessionPasskey.withPasskey;

// @ts-expect-error the complete builder is terminal
void otpThenPasskey.withOtp;

// @ts-expect-error the complete builder is terminal
void otpThenPasskey.withPasskey;

// @ts-expect-error the complete builder is terminal in the other order
void passkeyThenOtp.withOtp;

// @ts-expect-error the complete builder is terminal in the other order
void passkeyThenOtp.withPasskey;

/* Every configured feature is nested and absent before configuration. */

void sessionOnly.session.create;
void sessionOtp.otp.authenticate;
void sessionPasskey.passkey.createAuthenticationOptions;
void otpThenPasskey.otp.request;
void otpThenPasskey.passkey.list;

// @ts-expect-error OTP does not exist before withOtp
void sessionOnly.otp;

// @ts-expect-error passkeys do not exist before withPasskey
void sessionOnly.passkey;

// @ts-expect-error OTP methods are nested
void sessionOtp.authenticate;

// @ts-expect-error passkey methods are nested
void sessionPasskey.createAuthenticationOptions;

/* Session-only auth exposes create for bespoke authentication. */

expectType<Promise<SessionCreated>>(
  sessionOnly.session.create({ userId: "user-1" }),
);
expectType<Promise<SessionIdentity | null>>(sessionOnly.session.get());
expectType<Promise<SessionRefreshed>>(sessionOnly.session.refresh());
expectType<Promise<ListedSession[]>>(sessionOnly.session.list());
expectType<Promise<void>>(sessionOnly.session.end());
expectType<Promise<void>>(sessionOnly.session.endAll());
expectType<Promise<boolean>>(
  sessionOnly.session.revoke({ sessionId: "session-1" }),
);

/* Installed strategies retain session management but internalize creation. */

void sessionOtp.session.get;
void sessionOtp.session.list;
void sessionOtp.session.end;
void sessionOtp.session.endAll;
void sessionOtp.session.revoke;
void sessionPasskey.session.refresh;
void otpThenPasskey.session.get;

// @ts-expect-error OTP authentication establishes sessions internally
void sessionOtp.session.create;

// @ts-expect-error passkey authentication establishes sessions internally
void sessionPasskey.session.create;

// @ts-expect-error complete auth establishes sessions through its strategies
void otpThenPasskey.session.create;

/* OTP public methods describe authentication, not its proof primitive. */

expectType<Promise<{ success: true }>>(
  sessionOtp.otp.request({ identifier: "person@example.com" }),
);

const authenticated = sessionOtp.otp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
});

declare const authenticationResult: Awaited<typeof authenticated>;

if (authenticationResult.success) {
  expectType<boolean>(authenticationResult.data.user.isNew);
  expectType<SessionCreated>(authenticationResult.data.session);
}

// @ts-expect-error verify belongs to the independently exported OTP primitive
void sessionOtp.otp.verify;

/* Passkey exposes orchestrated workflows and credential management. */

void sessionPasskey.passkey.createRegistrationOptions;
void sessionPasskey.passkey.createAdditionalRegistrationOptions;
void sessionPasskey.passkey.verifyRegistration;
void sessionPasskey.passkey.createAuthenticationOptions;
void sessionPasskey.passkey.verifyAuthentication;
void sessionPasskey.passkey.list;
void sessionPasskey.passkey.remove;

// @ts-expect-error registration-token ceremony is internal
void sessionPasskey.passkey.createRegistrationToken;

// @ts-expect-error registration-token validation is internal
void sessionPasskey.passkey.validateRegistrationToken;

expectType<PasskeyNamespace<SessionCreated>>(sessionPasskey.passkey);

/* OTP configuration shows every required DI directly. */

void otp.storage;
void otp.delivery;
void otp.generateOtp;
void otp.ttl;
void otp.authorizeRequest;
void otp.resolveUser;

const incompleteOtp = {
  storage: otpStorage,
  delivery: otpDelivery,
  generateOtp: () => "123456",
  ttl: 600_000,
  resolveUser: async () => ({
    userId: "user-1",
    isNew: true,
  }),
};

// @ts-expect-error authorizeRequest is required
void sessionOnly.withOtp(incompleteOtp);

const otpWithUnknownConfiguration = {
  storage: otpStorage,
  delivery: otpDelivery,
  generateOtp: () => "123456",
  ttl: 600_000,
  authorizeRequest: async () => true,
  resolveUser: async () => ({
    userId: "user-1",
    isNew: true,
  }),
  unknown: true,
};

// Structural variables may carry additional fields; literal calls are exact.
void sessionOnly.withOtp(otpWithUnknownConfiguration);

void sessionOnly.withOtp({
  storage: otpStorage,
  delivery: otpDelivery,
  generateOtp: () => "123456",
  ttl: 600_000,
  authorizeRequest: async () => true,
  resolveUser: async () => ({
    userId: "user-1",
    isNew: true,
  }),
  // @ts-expect-error unknown literal OTP configuration is rejected
  unknown: true,
});

/* Public methods accept values, never framework contexts. */

// @ts-expect-error create accepts only an application-authorized userId
void sessionOnly.session.create({ userId: "user-1", context: {} });

// @ts-expect-error get receives no public context
void sessionOnly.session.get({ context: {} });

void sessionOtp.otp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
  // @ts-expect-error authentication receives no public context
  context: {},
});
