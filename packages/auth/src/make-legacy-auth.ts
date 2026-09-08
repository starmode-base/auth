import type { FullAuthConfig, MakeAuthResult } from "./types";
import { makeCoreAuth } from "./make-core-auth";
import { makeOtpMethods } from "./make-otp-auth";
import { makePasskeyMethods } from "./make-passkey-auth";

export function makeAuth(config: FullAuthConfig): MakeAuthResult {
  const { methods: core, storeSession, result } = makeCoreAuth(config);

  const otp = makeOtpMethods(config.otp.storage, config.otp.transport, result);

  const passkey = makePasskeyMethods(
    config.passkey.storage,
    config.passkey.registrationCodec,
    config.passkey.webAuthn,
    storeSession,
    result,
  );

  return { ...core, ...otp, ...passkey };
}
