/**
 * Type tests for the builder factory spike.
 *
 * Compiled by tsc (bun run check), never executed — this file IS the test;
 * @ts-expect-error lines fail the build if the error stops occurring, so the
 * contract is checked in both directions.
 */
import type {
  MakeAuthConfig,
  WithOtpConfig,
  WithPasskeyConfig,
  AuthCore,
  AuthCoreOtp,
  AuthCorePasskey,
  AuthFull,
} from "./contracts";
import { makeAuth } from "./contracts";

declare const session: MakeAuthConfig;
declare const otp: WithOtpConfig;
declare const passkey: WithPasskeyConfig;

function expectType<T>(value: T): T {
  return value;
}

/* Methods follow the chain — the four shapes */
expectType<AuthCore>(makeAuth(session));
expectType<AuthCoreOtp>(makeAuth(session).withOtp(otp));
expectType<AuthCorePasskey>(makeAuth(session).withPasskey(passkey));
expectType<AuthFull>(makeAuth(session).withOtp(otp).withPasskey(passkey));

/* Chain order doesn't matter */
expectType<AuthFull>(makeAuth(session).withPasskey(passkey).withOtp(otp));

/* The session namespace is present at every step */
void makeAuth(session).session.get;
void makeAuth(session).withOtp(otp).session.end;
void makeAuth(session).withOtp(otp).withPasskey(passkey).session.create;

/* Strategy namespaces only exist after their step */
void makeAuth(session).withOtp(otp).otp.verify;
void makeAuth(session).withPasskey(passkey).passkey.verifyAuthentication;
void makeAuth(session).withOtp(otp).withPasskey(passkey).passkey
  .registrationOptions;

// @ts-expect-error otp namespace does not exist before withOtp
void makeAuth(session).otp;

// @ts-expect-error otp namespace does not exist on a passkey-only instance
void makeAuth(session).withPasskey(passkey).otp;

// @ts-expect-error passkey namespace does not exist on an otp-only instance
void makeAuth(session).withOtp(otp).passkey;

/* All methods live in namespaces — the root holds no methods */

// @ts-expect-error getSession is not a root method — it is auth.session.get
void makeAuth(session).getSession;

// @ts-expect-error createSession is not a root method — it is auth.session.create
void makeAuth(session).withOtp(otp).createSession;

// @ts-expect-error verifyOtp is not a root method — it is auth.otp.verify
void makeAuth(session).withOtp(otp).verifyOtp;

// @ts-expect-error verifyAuthentication is not a root method — it is auth.passkey.verifyAuthentication
void makeAuth(session).withPasskey(passkey).verifyAuthentication;

/* Passkey verification is pure — it returns the userId, never a session */

declare const verifyResult: Awaited<
  ReturnType<AuthFull["passkey"]["verifyAuthentication"]>
>;

if (verifyResult.success) {
  void verifyResult.data.userId;
  // @ts-expect-error verification carries no session — create one explicitly via session.create
  void verifyResult.data.session;
}

declare const registrationResult: Awaited<
  ReturnType<AuthFull["passkey"]["verifyRegistration"]>
>;

if (registrationResult.success) {
  void registrationResult.data.userId;
  // @ts-expect-error registration carries no session — create one explicitly via session.create
  void registrationResult.data.session;
}

/* Commands without failure modes collapse — the envelope needs no narrowing */

declare const created: Awaited<ReturnType<AuthCore["session"]["create"]>>;
void created.success;
void created.data.token;
void created.data.userId;

// @ts-expect-error T rides in data, never spread into the envelope
void created.token;

/* Void commands drop the data field entirely */

declare const ended: Awaited<ReturnType<AuthCore["session"]["end"]>>;
void ended.success;
// @ts-expect-error void commands carry no data field
void ended.data;

/* Commands with failure modes require narrowing before data access */

declare const otpVerified: Awaited<ReturnType<AuthFull["otp"]["verify"]>>;
// @ts-expect-error error exists only on the failure branch — narrow on success first
void otpVerified.error;

/* Error unions are narrowed per method */

declare const otpFailure: Extract<
  Awaited<ReturnType<AuthFull["otp"]["verify"]>>,
  { success: false }
>;
const otpError: "invalid_otp" = otpFailure.error;
void otpError;

/* Duplicate steps are type errors — with* removes itself from the chain */

// @ts-expect-error withOtp cannot be chained twice
void makeAuth(session).withOtp(otp).withOtp(otp);

// @ts-expect-error withPasskey cannot be chained twice
void makeAuth(session).withPasskey(passkey).withPasskey(passkey);

// @ts-expect-error nothing left to chain after both strategies
void makeAuth(session).withOtp(otp).withPasskey(passkey).withOtp(otp);

/* Unknown config keys are rejected */

// @ts-expect-error unknown key in session config
void makeAuth({ ...session, unknown: true });

// @ts-expect-error unknown key in otp config
void makeAuth(session).withOtp({ ...otp, unknown: true });

// @ts-expect-error unknown key in passkey config
void makeAuth(session).withPasskey({ ...passkey, unknown: true });

/* Every field is required */

// @ts-expect-error delivery is required in otp config
void makeAuth(session).withOtp({ storage: otp.storage });

// @ts-expect-error challenges is required in passkey config
void makeAuth(session).withPasskey({
  storage: passkey.storage,
  registrationCodec: passkey.registrationCodec,
  webAuthn: passkey.webAuthn,
});

// @ts-expect-error debug is required in session config
void makeAuth({
  storage: session.storage,
  codec: session.codec,
  transport: session.transport,
  ttl: session.ttl,
});
