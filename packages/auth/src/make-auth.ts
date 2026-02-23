import type {
  AuthConfig,
  FullAuthConfig,
  OtpOnlyAuthConfig,
  OtpAuthResult,
  PasskeyAuthResult,
  MakeAuthResult,
} from "./types";
import { makeCoreAuth } from "./make-core-auth";
import { makeOtpMethods } from "./make-otp-auth";
import { makePasskeyMethods } from "./make-passkey-auth";

export function makeAuth<T extends AuthConfig>(
  config: T,
): T extends FullAuthConfig
  ? MakeAuthResult
  : T extends OtpOnlyAuthConfig
    ? OtpAuthResult
    : PasskeyAuthResult;

export function makeAuth(
  config: AuthConfig,
): OtpAuthResult | PasskeyAuthResult | MakeAuthResult {
  const { methods: core, storeSession, result } = makeCoreAuth(config);

  const otp =
    "otp" in config && config.otp
      ? makeOtpMethods(config.otp.storage, config.otp.transport, result)
      : undefined;

  const passkey =
    "passkey" in config && config.passkey
      ? makePasskeyMethods(
          config.passkey.storage,
          config.passkey.registrationCodec,
          config.passkey.webAuthn,
          storeSession,
          result,
        )
      : undefined;

  return { ...core, ...otp, ...passkey } as
    | OtpAuthResult
    | PasskeyAuthResult
    | MakeAuthResult;
}
