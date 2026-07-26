/**
 * Usage API candidate.
 *
 * This spike specifies the server-side functions returned by configuration.
 * It does not specify token shapes, lifetime policy, persistence, transport,
 * framework context, or mechanism construction. Session implementations and
 * feature factories own those concerns.
 */

/** The authenticated identity exposed by every session implementation */
export type SessionIdentity = {
  userId: string;
};

/**
 * Complete injected session implementation.
 *
 * The implementation owns every credential and lifecycle decision. Its
 * operation results are preserved by the public session namespace. get is a
 * repeatable read-only operation; refresh is an explicit operation separate
 * from get.
 */
export type SessionAdapter<CreateResult, RefreshResult> = {
  create: (userId: string) => Promise<CreateResult>;
  get: () => Promise<SessionIdentity | null>;
  refresh: () => Promise<RefreshResult>;
  end: () => Promise<void>;
};

/**
 * The least session authority supplied to an authentication feature.
 *
 * A feature can establish a session for a verified user but cannot inspect,
 * refresh, or end an existing session through this capability.
 */
export type SessionCreator<CreateResult> = {
  create: (userId: string) => Promise<CreateResult>;
};

/** Public session functions returned by withSession */
export type SessionNamespace<CreateResult, RefreshResult> = {
  create: (args: { userId: string }) => Promise<CreateResult>;
  get: () => Promise<SessionIdentity | null>;
  refresh: () => Promise<RefreshResult>;
  end: () => Promise<void>;
};

/**
 * Minimum public OTP surface.
 *
 * Concrete OTP features retain their exact method return types and may return
 * different implementations when installed with and without sessions.
 */
export type OtpNamespace = {
  send: (args: { identifier: string }) => Promise<unknown>;
  verify: (args: { identifier: string; otp: string }) => Promise<unknown>;
};

/**
 * Minimum public passkey surface.
 *
 * The feature owns WebAuthn ceremony behavior and exact result types. The
 * usage API fixes only the server-side operations and their inputs.
 */
export type PasskeyNamespace = {
  createRegistrationToken: (args: {
    userId: string;
    identifier: string | null;
  }) => Promise<unknown>;
  validateRegistrationToken: (args: {
    registrationToken: string;
  }) => Promise<unknown>;
  createRegistrationOptions: (args: {
    registrationToken: string;
  }) => Promise<unknown>;
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationResponseJSON;
  }) => Promise<unknown>;
  createAuthenticationOptions: () => Promise<unknown>;
  verifyAuthentication: (args: {
    credential: AuthenticationResponseJSON;
  }) => Promise<unknown>;
};

/**
 * OTP configuration feature.
 *
 * OTP can be installed alone for verification or after sessions for an
 * authentication flow. Each installation produces its complete public OTP
 * namespace. The builder does not inspect either implementation.
 */
export type OtpFeature<
  SessionCreateResult,
  StandaloneMethods extends OtpNamespace,
  SessionMethods extends OtpNamespace,
> = {
  makeStandaloneMethods: () => StandaloneMethods;
  makeSessionMethods: (
    session: SessionCreator<SessionCreateResult>,
  ) => SessionMethods;
};

/**
 * Passkey configuration feature.
 *
 * Passkeys are installed only after sessions. The builder supplies the
 * session-creation capability retained from withSession and exposes the
 * returned methods as the passkey namespace.
 */
export type PasskeyFeature<
  SessionCreateResult,
  Methods extends PasskeyNamespace,
> = {
  makeSessionMethods: (session: SessionCreator<SessionCreateResult>) => Methods;
};

/** Input for the usage API candidate */
export type MakeAuthConfig = {
  debug: boolean;
};

/** No feature configured */
export type Auth = {
  withOtp: <
    SessionCreateResult,
    StandaloneMethods extends OtpNamespace,
    SessionMethods extends OtpNamespace,
  >(
    otp: OtpFeature<SessionCreateResult, StandaloneMethods, SessionMethods>,
  ) => AuthOtp<StandaloneMethods>;
  withSession: <CreateResult, RefreshResult>(
    session: SessionAdapter<CreateResult, RefreshResult>,
  ) => AuthSession<CreateResult, RefreshResult>;
};

/** Standalone OTP verification */
export type AuthOtp<Methods extends OtpNamespace> = {
  otp: Methods;
};

/**
 * Sessions without an authentication strategy.
 *
 * The public session namespace permits applications to build bespoke
 * authentication strategies over create. Installing any strategy hides this
 * namespace while retaining the session internally for remaining features.
 */
export type AuthSession<CreateResult, RefreshResult> = {
  session: SessionNamespace<CreateResult, RefreshResult>;
  withOtp: <
    StandaloneMethods extends OtpNamespace,
    SessionMethods extends OtpNamespace,
  >(
    otp: OtpFeature<CreateResult, StandaloneMethods, SessionMethods>,
  ) => AuthSessionOtp<CreateResult, SessionMethods>;
  withPasskey: <Methods extends PasskeyNamespace>(
    passkey: PasskeyFeature<CreateResult, Methods>,
  ) => AuthSessionPasskey<CreateResult, Methods>;
};

/** Session-aware OTP with passkeys still available to configure */
export type AuthSessionOtp<
  SessionCreateResult,
  OtpMethods extends OtpNamespace,
> = {
  otp: OtpMethods;
  withPasskey: <PasskeyMethods extends PasskeyNamespace>(
    passkey: PasskeyFeature<SessionCreateResult, PasskeyMethods>,
  ) => AuthFull<OtpMethods, PasskeyMethods>;
};

/** Session-aware passkeys with OTP still available to configure */
export type AuthSessionPasskey<
  SessionCreateResult,
  PasskeyMethods extends PasskeyNamespace,
> = {
  passkey: PasskeyMethods;
  withOtp: <
    StandaloneMethods extends OtpNamespace,
    SessionMethods extends OtpNamespace,
  >(
    otp: OtpFeature<SessionCreateResult, StandaloneMethods, SessionMethods>,
  ) => AuthFull<SessionMethods, PasskeyMethods>;
};

/** Sessions with both shipped authentication strategies */
export type AuthFull<
  OtpMethods extends OtpNamespace,
  PasskeyMethods extends PasskeyNamespace,
> = {
  otp: OtpMethods;
  passkey: PasskeyMethods;
};

/**
 * Candidate dependency-aware builder.
 *
 * This declaration is a compile-time usage probe. Runtime construction and
 * the internal retention of configured capabilities are not specified here.
 */
export declare function makeAuth(config: MakeAuthConfig): Auth;
