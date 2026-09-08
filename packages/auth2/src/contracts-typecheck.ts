/** Compile time proofs for passkeys composed with the promoted authentication API */
import type {
  AuthUser,
  OtpEngine,
  OtpStrategy,
  PasskeyEngine,
  PasskeyRegistrationCredential,
  PasskeyStrategy,
  RegisteredPasskeyUser,
  SessionAdapter,
  SessionIdentity,
} from "./index";
import { makeAuth, makeOtpStrategy, makePasskeyStrategy } from "./index";

function expectType<T>(value: T): T {
  return value;
}

type SessionCredential = { accessToken: "created" };
type ResolvedUser = AuthUser & { isNew: boolean };

declare const session: SessionAdapter<SessionIdentity, SessionCredential, {}>;
declare const otpEngine: OtpEngine<ResolvedUser>;
declare const passkeyEngine: PasskeyEngine;
declare const registrationCredential: PasskeyRegistrationCredential;

const auth = makeAuth(session, (kernel) => ({
  otp: makeOtpStrategy(kernel, otpEngine),
  passkeys: makePasskeyStrategy(kernel, passkeyEngine),
}));

expectType<OtpStrategy<ResolvedUser, SessionCredential>>(auth.strategies.otp);
expectType<PasskeyStrategy<SessionCredential>>(auth.strategies.passkeys);

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
