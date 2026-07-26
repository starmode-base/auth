/**
 * Compile-time proofs for the usage API candidate.
 *
 * This file is compiled and never executed. Each @ts-expect-error proves that
 * an unsupported chain or public method remains unavailable.
 */
import type {
  Auth,
  AuthFull,
  AuthOtp,
  AuthSession,
  AuthSessionOtp,
  AuthSessionPasskey,
  OtpFeature,
  OtpNamespace,
  PasskeyFeature,
  PasskeyNamespace,
  SessionAdapter,
  SessionIdentity,
} from "./contracts";
import { makeAuth } from "./contracts";

type SessionCreated = {
  credential: "created";
};

type SessionRefreshed = {
  credential: "refreshed";
};

type OtherSessionCreated = {
  credential: "other";
};

type StandaloneOtpMethods = {
  send: (args: { identifier: string }) => Promise<"sent">;
  verify: (args: { identifier: string; otp: string }) => Promise<"verified">;
};

type SessionOtpMethods = {
  send: (args: { identifier: string }) => Promise<"sent">;
  verify: (args: {
    identifier: string;
    otp: string;
  }) => Promise<"session-established">;
};

type PasskeyMethods = {
  createRegistrationToken: (args: {
    userId: string;
    identifier: string | null;
  }) => Promise<"registration-token">;
  validateRegistrationToken: (args: {
    registrationToken: string;
  }) => Promise<"registration-grant">;
  createRegistrationOptions: (args: {
    registrationToken: string;
  }) => Promise<"registration-options">;
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationResponseJSON;
  }) => Promise<"session-established">;
  createAuthenticationOptions: () => Promise<"authentication-options">;
  verifyAuthentication: (args: {
    credential: AuthenticationResponseJSON;
  }) => Promise<"session-established">;
};

declare const session: SessionAdapter<SessionCreated, SessionRefreshed>;
declare const otp: OtpFeature<
  SessionCreated,
  StandaloneOtpMethods,
  SessionOtpMethods
>;
declare const passkey: PasskeyFeature<SessionCreated, PasskeyMethods>;
declare const incompatibleOtp: OtpFeature<
  OtherSessionCreated,
  StandaloneOtpMethods,
  SessionOtpMethods
>;
declare const incompatiblePasskey: PasskeyFeature<
  OtherSessionCreated,
  PasskeyMethods
>;

function expectType<T>(value: T): T {
  return value;
}

const base = makeAuth({ debug: true });
const otpOnly = makeAuth({ debug: true }).withOtp(otp);
const sessionOnly = makeAuth({ debug: true }).withSession(session);
const sessionOtp = makeAuth({ debug: true }).withSession(session).withOtp(otp);
const sessionPasskey = makeAuth({ debug: true })
  .withSession(session)
  .withPasskey(passkey);
const otpThenPasskey = makeAuth({ debug: true })
  .withSession(session)
  .withOtp(otp)
  .withPasskey(passkey);
const passkeyThenOtp = makeAuth({ debug: true })
  .withSession(session)
  .withPasskey(passkey)
  .withOtp(otp);

/* Every approved chain returns its exact public API. */

expectType<Auth>(base);
expectType<AuthOtp<StandaloneOtpMethods>>(otpOnly);
expectType<AuthSession<SessionCreated, SessionRefreshed>>(sessionOnly);
expectType<AuthSessionOtp<SessionCreated, SessionOtpMethods>>(sessionOtp);
expectType<AuthSessionPasskey<SessionCreated, PasskeyMethods>>(sessionPasskey);
expectType<AuthFull<SessionOtpMethods, PasskeyMethods>>(otpThenPasskey);
expectType<AuthFull<SessionOtpMethods, PasskeyMethods>>(passkeyThenOtp);

/* Chaining preserves the exact method results produced by each feature. */

expectType<Promise<"sent">>(
  otpOnly.otp.send({ identifier: "person@example.com" }),
);
expectType<Promise<"verified">>(
  otpOnly.otp.verify({
    identifier: "person@example.com",
    otp: "123456",
  }),
);
expectType<Promise<"session-established">>(
  sessionOtp.otp.verify({
    identifier: "person@example.com",
    otp: "123456",
  }),
);
expectType<Promise<"authentication-options">>(
  sessionPasskey.passkey.createAuthenticationOptions(),
);

/* Session-only auth exposes the complete nested session API. */

expectType<Promise<SessionCreated>>(
  sessionOnly.session.create({ userId: "user-1" }),
);
expectType<Promise<SessionIdentity | null>>(sessionOnly.session.get());
expectType<Promise<SessionRefreshed>>(sessionOnly.session.refresh());
expectType<Promise<void>>(sessionOnly.session.end());

// @ts-expect-error OTP is not exposed before withOtp
void sessionOnly.otp;

// @ts-expect-error passkeys are not exposed before withPasskey
void sessionOnly.passkey;

/* Strategy methods are nested and never duplicated at the root. */

void otpOnly.otp.send;
void sessionOtp.otp.verify;
void sessionPasskey.passkey.createRegistrationOptions;
void otpThenPasskey.otp.send;
void otpThenPasskey.passkey.verifyAuthentication;

// @ts-expect-error OTP methods are nested under auth.otp
void otpOnly.send;

// @ts-expect-error session methods are nested under auth.session
void sessionOnly.get;

// @ts-expect-error passkey methods are nested under auth.passkey
void sessionPasskey.createAuthenticationOptions;

/* Installing any strategy hides the public session namespace. */

// @ts-expect-error session is hidden by a session-aware OTP strategy
void sessionOtp.session;

// @ts-expect-error passkeys are not exposed before withPasskey
void sessionOtp.passkey;

// @ts-expect-error session is hidden by a passkey strategy
void sessionPasskey.session;

// @ts-expect-error OTP is not exposed before withOtp
void sessionPasskey.otp;

// @ts-expect-error session stays hidden when every strategy is configured
void otpThenPasskey.session;

// @ts-expect-error session stays hidden in the alternate approved order
void passkeyThenOtp.session;

/* A base auth value supports OTP or sessions, but never passkeys directly. */

void base.withOtp;
void base.withSession;

// @ts-expect-error passkeys require a configured session
void base.withPasskey(passkey);

// @ts-expect-error no usage namespace exists before a feature is configured
void base.otp;

// @ts-expect-error no usage namespace exists before a feature is configured
void base.session;

// @ts-expect-error no usage namespace exists before a feature is configured
void base.passkey;

/* Standalone OTP is terminal in the approved dependency graph. */

// @ts-expect-error standalone OTP cannot be upgraded to session auth
void otpOnly.withSession(session);

// @ts-expect-error passkeys cannot be added without first configuring sessions
void otpOnly.withPasskey(passkey);

// @ts-expect-error OTP cannot be installed twice
void otpOnly.withOtp(otp);

// @ts-expect-error standalone OTP exposes no session namespace
void otpOnly.session;

// @ts-expect-error standalone OTP exposes no passkey namespace
void otpOnly.passkey;

/* Sessions may install either strategy exactly once. */

void sessionOnly.withOtp(otp);
void sessionOnly.withPasskey(passkey);

// @ts-expect-error session-aware OTP must accept this session's creation result
void sessionOnly.withOtp(incompatibleOtp);

// @ts-expect-error passkeys must accept this session's creation result
void sessionOnly.withPasskey(incompatiblePasskey);

// @ts-expect-error sessions cannot be installed twice
void sessionOnly.withSession(session);

// @ts-expect-error OTP cannot be installed twice
void sessionOtp.withOtp(otp);

// @ts-expect-error sessions cannot be installed twice
void sessionOtp.withSession(session);

// @ts-expect-error passkeys cannot be installed twice
void sessionPasskey.withPasskey(passkey);

// @ts-expect-error sessions cannot be installed twice
void sessionPasskey.withSession(session);

/* Full auth is terminal regardless of the approved strategy order. */

// @ts-expect-error OTP is already installed
void otpThenPasskey.withOtp(otp);

// @ts-expect-error passkeys are already installed
void otpThenPasskey.withPasskey(passkey);

// @ts-expect-error sessions are already installed and hidden
void otpThenPasskey.withSession(session);

// @ts-expect-error OTP is already installed
void passkeyThenOtp.withOtp(otp);

// @ts-expect-error passkeys are already installed
void passkeyThenOtp.withPasskey(passkey);

// @ts-expect-error sessions are already installed and hidden
void passkeyThenOtp.withSession(session);

/* Configuration is complete and exact. */

// @ts-expect-error debug is required
void makeAuth({});

// @ts-expect-error unknown base config keys are rejected
void makeAuth({ debug: true, unknown: true });

/* Public session methods accept values, never framework contexts. */

// @ts-expect-error create accepts only an application-authorized userId
void sessionOnly.session.create({ userId: "user-1", context: {} });

// @ts-expect-error get receives no public context
void sessionOnly.session.get({ context: {} });

// @ts-expect-error refresh receives no public context
void sessionOnly.session.refresh({ context: {} });

// @ts-expect-error end receives no public context
void sessionOnly.session.end({ context: {} });

/* The required namespace contracts remain structural. */

expectType<OtpNamespace>(otpOnly.otp);
expectType<PasskeyNamespace>(sessionPasskey.passkey);
