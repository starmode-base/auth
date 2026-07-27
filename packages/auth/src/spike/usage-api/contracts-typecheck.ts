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
  PasskeyNamespace,
  PasskeySummary,
  Result,
  SessionAdapter,
  SessionIdentity,
  SessionSummary,
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

type ListedPasskey = PasskeySummary & {
  label: string;
};

declare const session: SessionAdapter<
  SessionCreated,
  SessionRefreshed,
  ListedSession
>;
declare const registrationOptions: PublicKeyCredentialCreationOptionsJSON;
declare const authenticationOptions: PublicKeyCredentialRequestOptionsJSON;

const otp = {
  request: async ({ identifier }) => {
    void identifier;
    return { success: true };
  },
  authenticate: async ({ identifier, otp: submittedOtp }) => {
    if (submittedOtp.length === 0) {
      return { success: false, error: "invalid_otp" };
    }

    return {
      success: true,
      data: {
        userId: identifier,
        isNew: true,
      },
    };
  },
} satisfies WithOtpConfig<ResolvedUser>;

const passkey = {
  createRegistrationOptions: async ({ intent, userId }) => {
    void intent;
    void userId;
    return { success: true, data: registrationOptions };
  },
  verifyRegistration: async ({ credential }) => {
    void credential;
    return {
      success: true,
      data: {
        intent: "sign-up",
        userId: "user-1",
      },
    };
  },
  createAuthenticationOptions: async () => ({
    success: true,
    data: authenticationOptions,
  }),
  verifyAuthentication: async ({ credential }) => {
    void credential;
    return {
      success: true,
      data: {
        userId: "user-1",
      },
    };
  },
  list: async (userId) => [
    {
      credentialId: "credential-1",
      label: userId,
    },
  ],
  remove: async (userId, credentialId) => {
    void userId;
    void credentialId;
    return { success: true };
  },
} satisfies WithPasskeyConfig<ListedPasskey>;

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
expectType<
  AuthPasskey<SessionCreated, SessionRefreshed, ListedSession, ListedPasskey>
>(sessionPasskey);
expectType<
  AuthFull<
    SessionCreated,
    SessionRefreshed,
    ListedSession,
    ResolvedUser,
    ListedPasskey
  >
>(otpThenPasskey);
expectType<
  AuthFull<
    SessionCreated,
    SessionRefreshed,
    ListedSession,
    ResolvedUser,
    ListedPasskey
  >
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

/* OTP strategy establishes a user; core adds the session. */

expectType<Promise<{ success: true }>>(
  otp.request({ identifier: "person@example.com" }),
);
expectType<
  Promise<Result<ResolvedUser, "invalid_otp" | "authentication_disabled">>
>(
  otp.authenticate({
    identifier: "person@example.com",
    otp: "123456",
  }),
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

/* Passkey strategy establishes identities; core scopes and creates sessions. */

void passkey.createRegistrationOptions({
  intent: "sign-up",
  userId: null,
});
void passkey.createRegistrationOptions({
  intent: "add",
  userId: "user-1",
});
void passkey.verifyRegistration;
void passkey.createAuthenticationOptions;
void passkey.verifyAuthentication;
void passkey.list("user-1");
void passkey.remove("user-1", "credential-1");

void sessionPasskey.passkey.createRegistrationOptions;
void sessionPasskey.passkey.createAdditionalRegistrationOptions;
void sessionPasskey.passkey.verifyRegistration;
void sessionPasskey.passkey.createAuthenticationOptions;
void sessionPasskey.passkey.verifyAuthentication;
void sessionPasskey.passkey.list;
void sessionPasskey.passkey.remove;

// @ts-expect-error core supplies registration intent and current user
void sessionPasskey.passkey.createRegistrationOptions({
  intent: "sign-up",
  userId: null,
});

// @ts-expect-error core derives the current user before listing
void sessionPasskey.passkey.list("user-1");

// @ts-expect-error registration-token ceremony is internal
void sessionPasskey.passkey.createRegistrationToken;

// @ts-expect-error registration-token validation is internal
void sessionPasskey.passkey.validateRegistrationToken;

expectType<PasskeyNamespace<SessionCreated, ListedPasskey>>(
  sessionPasskey.passkey,
);
expectType<Promise<Result<ListedPasskey[], "not_authenticated">>>(
  sessionPasskey.passkey.list(),
);

/* Literal strategy objects require every independently called operation. */

void otp.request;
void otp.authenticate;

const incompleteOtp = {
  request: async () => ({ success: true }),
};

// @ts-expect-error authenticate is required
void sessionOnly.withOtp(incompleteOtp);

const otpWithUnknownConfiguration = {
  ...otp,
  unknown: true,
};

// Structural variables may carry additional fields; literal calls are exact.
void sessionOnly.withOtp(otpWithUnknownConfiguration);

void sessionOnly.withOtp({
  request: otp.request,
  authenticate: otp.authenticate,
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
