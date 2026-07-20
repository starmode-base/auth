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
  Auth,
  AuthOtp,
  AuthPasskey,
  AuthFull,
} from "./contracts";
import { makeAuth } from "./contracts";

declare const config: MakeAuthConfig;
declare const otp: WithOtpConfig;
declare const passkey: WithPasskeyConfig;

function expectType<T>(value: T): T {
  return value;
}

/* Methods follow the chain — the four shapes */
expectType<Auth>(makeAuth(config));
expectType<AuthOtp>(makeAuth(config).withOtp(otp));
expectType<AuthPasskey>(makeAuth(config).withPasskey(passkey));
expectType<AuthFull>(makeAuth(config).withOtp(otp).withPasskey(passkey));

/* Chain order doesn't matter */
expectType<AuthFull>(makeAuth(config).withPasskey(passkey).withOtp(otp));

/* The session namespace is present at every step */
void makeAuth(config).session.get;
void makeAuth(config).withOtp(otp).session.end;
void makeAuth(config).withOtp(otp).withPasskey(passkey).session.create;

/* Strategy namespaces only exist after their step */
void makeAuth(config).withOtp(otp).otp.verify;
void makeAuth(config).withPasskey(passkey).passkey.verifyAuthentication;
void makeAuth(config).withOtp(otp).withPasskey(passkey).passkey
  .createRegistrationOptions;

// @ts-expect-error otp namespace does not exist before withOtp
void makeAuth(config).otp;

// @ts-expect-error otp namespace does not exist on a passkey-only instance
void makeAuth(config).withPasskey(passkey).otp;

// @ts-expect-error passkey namespace does not exist on an otp-only instance
void makeAuth(config).withOtp(otp).passkey;

/* All methods live in namespaces — the root holds no methods */

// @ts-expect-error getSession is not a root method — it is auth.session.get
void makeAuth(config).getSession;

// @ts-expect-error createSession is not a root method — it is auth.session.create
void makeAuth(config).withOtp(otp).createSession;

// @ts-expect-error verifyOtp is not a root method — it is auth.otp.verify
void makeAuth(config).withOtp(otp).verifyOtp;

// @ts-expect-error verifyAuthentication is not a root method — it is auth.passkey.verifyAuthentication
void makeAuth(config).withPasskey(passkey).verifyAuthentication;

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

declare const created: Awaited<ReturnType<Auth["session"]["create"]>>;
void created.success;
void created.data;

// @ts-expect-error T rides in data, never spread into the envelope
void created.token;

/* Void commands drop the data field entirely */

declare const ended: Awaited<ReturnType<Auth["session"]["end"]>>;
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
void makeAuth(config).withOtp(otp).withOtp(otp);

// @ts-expect-error withPasskey cannot be chained twice
void makeAuth(config).withPasskey(passkey).withPasskey(passkey);

// @ts-expect-error nothing left to chain after both strategies
void makeAuth(config).withOtp(otp).withPasskey(passkey).withOtp(otp);

/* Unknown config keys are rejected */

// @ts-expect-error unknown key in makeAuth config
void makeAuth({ ...config, unknown: true });

// @ts-expect-error unknown key in otp config
void makeAuth(config).withOtp({ ...otp, unknown: true });

// @ts-expect-error unknown key in passkey config
void makeAuth(config).withPasskey({ ...passkey, unknown: true });

/* Every field is required */

// @ts-expect-error delivery is required in otp config
void makeAuth(config).withOtp({ storage: otp.storage });

// @ts-expect-error challenge is required in passkey config
void makeAuth(config).withPasskey({
  storage: passkey.storage,
  registrationCodec: passkey.registrationCodec,
  webAuthn: passkey.webAuthn,
});

// @ts-expect-error debug is required in makeAuth config
void makeAuth({ session: config.session });
