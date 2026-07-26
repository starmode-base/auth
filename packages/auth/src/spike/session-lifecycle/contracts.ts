import type {
  OtpNamespace,
  PasskeyNamespace,
  Result,
  WithOtpConfig,
  WithPasskeyConfig,
} from "../contracts";

/**
 * One credential issued by a session mechanism. expiresAt is null when the
 * credential has no client-visible expiry.
 */
export type IssuedSessionCredential = {
  token: string;
  expiresAt: Date | null;
};

/**
 * Credentials issued when a session is created or refreshed.
 *
 * Every mechanism issues an access credential. Mechanisms that use the access
 * credential itself as the renewable server-side session handle return a null
 * refresh credential.
 */
export type IssuedSessionCredentials = {
  access: IssuedSessionCredential;
  refresh: IssuedSessionCredential | null;
};

/**
 * Credentials presented by a client.
 *
 * Either credential may be absent independently. In particular, a short-lived
 * access credential may expire while its refresh credential remains.
 */
export type PresentedSessionCredentials = {
  access: string | null;
  refresh: string | null;
};

/** The authenticated session data exposed by core */
export type SessionIdentity = {
  userId: string;
};

/**
 * Session lifecycle adapter.
 *
 * The adapter owns session policy and credential mechanics. ReadContext need
 * only support validation; WriteContext supplies the capabilities required by
 * session creation, refresh, and revocation. Ending a session revokes its
 * renewable authority. A previously issued self-contained access credential
 * may remain valid until its declared expiry.
 */
export type SessionAdapter<ReadContext, WriteContext> = {
  create: (
    context: WriteContext,
    userId: string,
  ) => Promise<IssuedSessionCredentials>;
  validate: (
    context: ReadContext,
    accessToken: string,
  ) => Promise<SessionIdentity | null>;
  refresh: (
    context: WriteContext,
    credentials: PresentedSessionCredentials,
  ) => Promise<IssuedSessionCredentials | null>;
  end: (
    context: WriteContext,
    credentials: PresentedSessionCredentials,
  ) => Promise<void>;
};

/** Input for the candidate session unit */
export type MakeSessionUnitConfig<ReadContext, WriteContext> = {
  session: SessionAdapter<ReadContext, WriteContext>;
};

/** Candidate session namespace shared by every session mechanism */
export type SessionNamespace<ReadContext, WriteContext> = {
  create: (args: {
    context: WriteContext;
    userId: string;
  }) => Promise<Result<IssuedSessionCredentials, never>>;
  validate: (args: {
    context: ReadContext;
    accessToken: string | null;
  }) => Promise<SessionIdentity | null>;
  refresh: (args: {
    context: WriteContext;
    credentials: PresentedSessionCredentials;
  }) => Promise<Result<IssuedSessionCredentials, "invalid_token">>;
  end: (args: {
    context: WriteContext;
    credentials: PresentedSessionCredentials;
  }) => Promise<Result<void, never>>;
};

/** The methods added by withSession */
export type SessionUnit<ReadContext, WriteContext> = {
  session: SessionNamespace<ReadContext, WriteContext>;
};

/** Config for the candidate base factory */
export type MakeAuthConfig = {
  debug: boolean;
};

/** No units configured */
export type Auth = {
  withSession: <ReadContext, WriteContext>(
    session: SessionAdapter<ReadContext, WriteContext>,
  ) => AuthSession<ReadContext, WriteContext>;
  withOtp: (config: WithOtpConfig) => AuthOtp;
  withPasskey: (config: WithPasskeyConfig) => AuthPasskey;
};

/** Sessions only */
export type AuthSession<ReadContext, WriteContext> = {
  session: SessionNamespace<ReadContext, WriteContext>;
  withOtp: (config: WithOtpConfig) => AuthSessionOtp<ReadContext, WriteContext>;
  withPasskey: (
    config: WithPasskeyConfig,
  ) => AuthSessionPasskey<ReadContext, WriteContext>;
};

/** OTP only */
export type AuthOtp = {
  otp: OtpNamespace;
  withSession: <ReadContext, WriteContext>(
    session: SessionAdapter<ReadContext, WriteContext>,
  ) => AuthSessionOtp<ReadContext, WriteContext>;
  withPasskey: (config: WithPasskeyConfig) => AuthOtpPasskey;
};

/** Passkeys only */
export type AuthPasskey = {
  passkey: PasskeyNamespace;
  withSession: <ReadContext, WriteContext>(
    session: SessionAdapter<ReadContext, WriteContext>,
  ) => AuthSessionPasskey<ReadContext, WriteContext>;
  withOtp: (config: WithOtpConfig) => AuthOtpPasskey;
};

/** Sessions and OTP */
export type AuthSessionOtp<ReadContext, WriteContext> = {
  session: SessionNamespace<ReadContext, WriteContext>;
  otp: OtpNamespace;
  withPasskey: (
    config: WithPasskeyConfig,
  ) => AuthFull<ReadContext, WriteContext>;
};

/** Sessions and passkeys */
export type AuthSessionPasskey<ReadContext, WriteContext> = {
  session: SessionNamespace<ReadContext, WriteContext>;
  passkey: PasskeyNamespace;
  withOtp: (config: WithOtpConfig) => AuthFull<ReadContext, WriteContext>;
};

/** OTP and passkeys */
export type AuthOtpPasskey = {
  otp: OtpNamespace;
  passkey: PasskeyNamespace;
  withSession: <ReadContext, WriteContext>(
    session: SessionAdapter<ReadContext, WriteContext>,
  ) => AuthFull<ReadContext, WriteContext>;
};

/** Every unit configured */
export type AuthFull<ReadContext, WriteContext> = {
  session: SessionNamespace<ReadContext, WriteContext>;
  otp: OtpNamespace;
  passkey: PasskeyNamespace;
};

/**
 * Candidate optional-unit builder. This declaration is exercised by the
 * composition probes; runtime builder work remains in the main spike.
 */
export declare function makeAuth(config: MakeAuthConfig): Auth;
