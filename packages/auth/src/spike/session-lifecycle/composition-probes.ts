/**
 * Compile-time probes for making sessions an optional auth unit.
 *
 * The candidate builder is declarative while the session lifecycle is still
 * being proven. These calls are compiled by tsc and never executed.
 */
import type {
  Auth,
  AuthFull,
  AuthOtp,
  AuthOtpPasskey,
  AuthPasskey,
  AuthSession,
  AuthSessionOtp,
  AuthSessionPasskey,
  SessionAdapter,
} from "./contracts";
import { makeAuth } from "./contracts";
import type { WithOtpConfig, WithPasskeyConfig } from "../contracts";

type ReadContext = {
  sessionReader: unknown;
};

type WriteContext = ReadContext & {
  sessionWriter: unknown;
};

declare const session: SessionAdapter<ReadContext, WriteContext>;
declare const otp: WithOtpConfig;
declare const passkey: WithPasskeyConfig;

function expectType<T>(value: T): T {
  return value;
}

const auth = makeAuth({ debug: true });

expectType<Auth>(auth);
expectType<AuthSession<ReadContext, WriteContext>>(auth.withSession(session));
expectType<AuthOtp>(auth.withOtp(otp));
expectType<AuthPasskey>(auth.withPasskey(passkey));

expectType<AuthSessionOtp<ReadContext, WriteContext>>(
  auth.withSession(session).withOtp(otp),
);
expectType<AuthSessionPasskey<ReadContext, WriteContext>>(
  auth.withPasskey(passkey).withSession(session),
);
expectType<AuthOtpPasskey>(auth.withOtp(otp).withPasskey(passkey));
expectType<AuthFull<ReadContext, WriteContext>>(
  auth.withOtp(otp).withPasskey(passkey).withSession(session),
);

/* A verification-only auth object has no session namespace. */

void auth.withOtp(otp).otp.verify;

// @ts-expect-error sessions do not exist until withSession is called
void auth.withOtp(otp).session;

/* Session composition is order-independent and single-use. */

void auth.withSession(session).withOtp(otp).session.validate;
void auth.withOtp(otp).withSession(session).session.refresh;

// @ts-expect-error withSession cannot be chained twice
void auth.withSession(session).withSession(session);

void auth
  .withOtp(otp)
  .withPasskey(passkey)
  .withSession(session)
  // @ts-expect-error withSession is gone after every unit is configured
  .withSession(session);

/* The base factory config remains complete and exact. */

// @ts-expect-error debug is required
void makeAuth({});

// @ts-expect-error unknown base config keys are rejected
void makeAuth({ debug: true, session });
