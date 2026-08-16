/** Compile-time evidence for fixed feature combination overloads. */
import type {
  FullAuth,
  OtpAuth,
  OtpConfig,
  PasskeyAuth,
  PasskeyConfig,
  SessionAuth,
  SessionConfig,
} from "./contracts";

type BaseConfig = {
  debug: boolean;
  session: SessionConfig;
};

type OtpOnlyConfig = BaseConfig & {
  otp: OtpConfig;
};

type PasskeyOnlyConfig = BaseConfig & {
  passkey: PasskeyConfig;
};

type FullConfig = BaseConfig & {
  otp: OtpConfig;
  passkey: PasskeyConfig;
};

declare function makeOverloadedAuth(config: FullConfig): FullAuth;
declare function makeOverloadedAuth(config: OtpOnlyConfig): OtpAuth;
declare function makeOverloadedAuth(config: PasskeyOnlyConfig): PasskeyAuth;
declare function makeOverloadedAuth(config: BaseConfig): SessionAuth;

declare const session: SessionConfig;
declare const otp: OtpConfig;
declare const passkey: PasskeyConfig;

function expectType<T>(value: T): T {
  return value;
}

const fullAuth = makeOverloadedAuth({
  debug: true,
  session,
  otp,
  passkey,
});

expectType<FullAuth>(fullAuth);

const namedFullConfigurationWithExtra = {
  debug: true,
  session,
  otp,
  passkey,
  unrelatedApplicationValue: true,
};

expectType<FullAuth>(makeOverloadedAuth(namedFullConfigurationWithExtra));

void makeOverloadedAuth({
  debug: true,
  session,
  // @ts-expect-error Fresh unrelated root properties are rejected.
  otp,
  passkey,
  unrelatedApplicationValue: true,
});

const invalidPasskeyConfiguration = {
  debug: true,
  session,
  otp,
  passkey: 123,
};

const otpAuth = makeOverloadedAuth(invalidPasskeyConfiguration);

expectType<OtpAuth>(otpAuth);

// @ts-expect-error The invalid passkey was ignored by the OTP overload.
void otpAuth.passkey;

const invalidOtpConfiguration = {
  debug: true,
  session,
  otp: 123,
  passkey,
};

const passkeyAuth = makeOverloadedAuth(invalidOtpConfiguration);

expectType<PasskeyAuth>(passkeyAuth);

// @ts-expect-error The invalid OTP was ignored by the passkey overload.
void passkeyAuth.otp;

const invalidFeatureConfiguration = {
  debug: true,
  session,
  otp: 123,
  passkey: 456,
};

const sessionAuth = makeOverloadedAuth(invalidFeatureConfiguration);

expectType<SessionAuth>(sessionAuth);

// @ts-expect-error Both invalid features were ignored by the base overload.
void sessionAuth.otp;

// @ts-expect-error Both invalid features were ignored by the base overload.
void sessionAuth.passkey;

// @ts-expect-error A fresh invalid feature value cannot fall through.
void makeOverloadedAuth({ debug: true, session, otp: 123 });
