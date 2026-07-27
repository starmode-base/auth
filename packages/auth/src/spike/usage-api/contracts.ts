/**
 * Server usage API candidate.
 *
 * Names in this spike are provisional. The contract under examination is the
 * ownership and composition model: literal objects are the DI contract,
 * chained features are complete authentication strategies, strategy DIs own
 * feature workflows, and core owns composition, session establishment, and
 * current-user scoping.
 */

/** Expected command result; infrastructure failures throw */
export type Result<T, E extends string> =
  | ([T] extends [void] ? { success: true } : { success: true; data: T })
  | ([E] extends [never] ? never : { success: false; error: E });

/** The authenticated identity shared by every strategy and session */
export type AuthUser = {
  userId: string;
};

/** The authenticated identity established by a session */
export type SessionIdentity = {
  userId: string;
};

/** Minimum safe session metadata exposed by session management */
export type SessionSummary = {
  sessionId: string;
};

/**
 * Complete injected session implementation.
 *
 * The implementation owns credential types, lifetime policy, persistence,
 * transport, and mechanism. Invocation-scoped environment access is closed
 * over when the object is constructed; no framework context enters the public
 * usage API.
 *
 * Summary is an application-defined safe projection. Core relies only on
 * sessionId and returns all additional fields unchanged.
 */
export type SessionAdapter<
  CreateResult,
  RefreshResult,
  Summary extends SessionSummary,
> = {
  create: (userId: string) => Promise<CreateResult>;
  /** Repeatable read-only lookup of the presented session */
  get: () => Promise<SessionIdentity | null>;
  /** Explicit renewal; get never performs it implicitly */
  refresh: () => Promise<RefreshResult>;
  end: () => Promise<void>;
  list: (userId: string) => Promise<Summary[]>;
  endAll: (userId: string) => Promise<void>;
  /**
   * Revokes sessionId only when it belongs to userId. False means no matching
   * owned session existed.
   */
  revoke: (userId: string, sessionId: string) => Promise<boolean>;
};

/** Session management available whether or not a strategy is installed */
export type SessionManagementNamespace<
  RefreshResult,
  Summary extends SessionSummary,
> = {
  get: () => Promise<SessionIdentity | null>;
  refresh: () => Promise<RefreshResult>;
  end: () => Promise<void>;
  /** Lists only sessions belonging to the authenticated user */
  list: () => Promise<Summary[]>;
  /** Ends every session belonging to the authenticated user */
  endAll: () => Promise<void>;
  /** Revokes an owned session; arbitrary userIds are never accepted */
  revoke: (args: { sessionId: string }) => Promise<boolean>;
};

/**
 * Complete session-only namespace.
 *
 * create is the escape hatch for applications implementing a bespoke
 * authentication strategy. Installed strategies retain create internally and
 * remove it from their ordinary public usage surface.
 */
export type SessionNamespace<
  CreateResult,
  RefreshResult,
  Summary extends SessionSummary,
> = SessionManagementNamespace<RefreshResult, Summary> & {
  create: (args: { userId: string }) => Promise<CreateResult>;
};

/**
 * Complete trusted OTP authentication strategy.
 *
 * request owns request policy, OTP generation, expiry, persistence, and
 * delivery. authenticate owns verification, consumption, authentication
 * policy, and identifier-to-user resolution. Core calls these operations
 * independently because they belong to separate server requests. Core creates
 * a session only after authenticate returns a user.
 *
 * request never reveals an expected request-policy denial; that outcome
 * returns success. Infrastructure failures, including delivery failures,
 * throw.
 *
 * A direct implementation replaces the OTP authentication engine. Helpers may
 * produce this same object from lower-level OTP primitives.
 */
export type WithOtpConfig<User extends AuthUser> = {
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
  authenticate: (args: {
    identifier: string;
    otp: string;
  }) => Promise<Result<User, "invalid_otp" | "authentication_disabled">>;
};

/** Result of the public orchestrated OTP authentication operation */
export type OtpAuthenticateResult<
  User extends AuthUser,
  SessionCreateResult,
> = Result<
  {
    user: User;
    session: SessionCreateResult;
  },
  "invalid_otp" | "authentication_disabled"
>;

/** OTP authentication workflows */
export type OtpNamespace<User extends AuthUser, SessionCreateResult> = {
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
  /** Authenticates the resolved user and establishes a session */
  authenticate: (args: {
    identifier: string;
    otp: string;
  }) => Promise<OtpAuthenticateResult<User, SessionCreateResult>>;
};

/** Minimum safe passkey metadata exposed by credential management */
export type PasskeySummary = {
  credentialId: string;
};

/** The two registration workflows have different session consequences */
export type RegistrationIntent = "sign-up" | "add";

/** Registration context established by core */
export type RegistrationContext =
  | {
      intent: "sign-up";
      userId: null;
    }
  | {
      intent: "add";
      userId: string;
    };

/** Registration identity returned by the strategy after verification */
export type RegisteredPasskeyUser = {
  intent: RegistrationIntent;
  userId: string;
};

/**
 * Complete trusted passkey authentication strategy.
 *
 * The object owns user provisioning, application policy, WebAuthn, challenge
 * lifecycle, credential persistence, counter handling, and atomic credential
 * removal. Core calls these operations independently because they span
 * separate public workflows and server requests.
 *
 * Summary is an application-defined safe projection. Core relies only on
 * credentialId and returns all additional fields unchanged.
 *
 * A direct implementation replaces the passkey authentication engine. Helpers
 * may produce this same object from lower-level WebAuthn, challenge, storage,
 * and application-user primitives.
 */
export type WithPasskeyConfig<Summary extends PasskeySummary> = {
  createRegistrationOptions: (
    context: RegistrationContext,
  ) => Promise<
    Result<PublicKeyCredentialCreationOptionsJSON, "registration_disabled">
  >;
  verifyRegistration: (args: {
    credential: RegistrationResponseJSON;
  }) => Promise<
    Result<
      RegisteredPasskeyUser,
      "registration_disabled" | "challenge_expired" | "verification_failed"
    >
  >;
  createAuthenticationOptions: () => Promise<
    Result<PublicKeyCredentialRequestOptionsJSON, never>
  >;
  verifyAuthentication: (args: {
    credential: AuthenticationResponseJSON;
  }) => Promise<
    Result<
      AuthUser,
      | "authentication_disabled"
      | "credential_not_found"
      | "challenge_expired"
      | "verification_failed"
    >
  >;
  list: (userId: string) => Promise<Summary[]>;
  /**
   * Atomically applies removal policy and removes only an owned credential.
   */
  remove: (
    userId: string,
    credentialId: string,
  ) => Promise<Result<void, "credential_not_found" | "removal_disabled">>;
};

/** Result of completing either public passkey registration workflow */
export type VerifyRegistrationResult<SessionCreateResult> = Result<
  | {
      intent: "sign-up";
      userId: string;
      session: SessionCreateResult;
    }
  | {
      intent: "add";
      userId: string;
    },
  "registration_disabled" | "challenge_expired" | "verification_failed"
>;

/** Passkey authentication and credential-management workflows */
export type PasskeyNamespace<
  SessionCreateResult,
  Summary extends PasskeySummary,
> = {
  /** Begins passkey-first signup */
  createRegistrationOptions: () => Promise<
    Result<PublicKeyCredentialCreationOptionsJSON, "registration_disabled">
  >;
  /** Begins adding a passkey for the authenticated user */
  createAdditionalRegistrationOptions: () => Promise<
    Result<
      PublicKeyCredentialCreationOptionsJSON,
      "not_authenticated" | "registration_disabled"
    >
  >;
  /** The strategy result determines whether completion signs in or adds */
  verifyRegistration: (args: {
    credential: RegistrationResponseJSON;
  }) => Promise<VerifyRegistrationResult<SessionCreateResult>>;
  createAuthenticationOptions: () => Promise<
    Result<PublicKeyCredentialRequestOptionsJSON, never>
  >;
  /** Verifies the assertion and establishes a session */
  verifyAuthentication: (args: {
    credential: AuthenticationResponseJSON;
  }) => Promise<
    Result<
      {
        userId: string;
        session: SessionCreateResult;
      },
      | "authentication_disabled"
      | "credential_not_found"
      | "challenge_expired"
      | "verification_failed"
    >
  >;
  /** Lists only passkeys belonging to the authenticated user */
  list: () => Promise<Result<Summary[], "not_authenticated">>;
  /** Removes only an owned passkey through the strategy's atomic operation */
  remove: (args: {
    credentialId: string;
  }) => Promise<
    Result<
      void,
      "not_authenticated" | "credential_not_found" | "removal_disabled"
    >
  >;
};

/** makeAuth always configures sessions */
export type MakeAuthConfig<
  CreateResult,
  RefreshResult,
  Summary extends SessionSummary,
> = {
  debug: boolean;
  session: SessionAdapter<CreateResult, RefreshResult, Summary>;
};

/** Sessions configured; either authentication strategy may be installed */
export type Auth<
  SessionCreateResult,
  SessionRefreshResult,
  Summary extends SessionSummary,
> = {
  session: SessionNamespace<SessionCreateResult, SessionRefreshResult, Summary>;
  withOtp: <User extends AuthUser>(
    config: WithOtpConfig<User>,
  ) => AuthOtp<SessionCreateResult, SessionRefreshResult, Summary, User>;
  withPasskey: <Passkey extends PasskeySummary>(
    config: WithPasskeyConfig<Passkey>,
  ) => AuthPasskey<SessionCreateResult, SessionRefreshResult, Summary, Passkey>;
};

/** Sessions plus OTP authentication; passkeys may still be installed */
export type AuthOtp<
  SessionCreateResult,
  SessionRefreshResult,
  Summary extends SessionSummary,
  User extends AuthUser,
> = {
  session: SessionManagementNamespace<SessionRefreshResult, Summary>;
  otp: OtpNamespace<User, SessionCreateResult>;
  withPasskey: <Passkey extends PasskeySummary>(
    config: WithPasskeyConfig<Passkey>,
  ) => AuthFull<
    SessionCreateResult,
    SessionRefreshResult,
    Summary,
    User,
    Passkey
  >;
};

/** Sessions plus passkey authentication; OTP may still be installed */
export type AuthPasskey<
  SessionCreateResult,
  SessionRefreshResult,
  Summary extends SessionSummary,
  Passkey extends PasskeySummary,
> = {
  session: SessionManagementNamespace<SessionRefreshResult, Summary>;
  passkey: PasskeyNamespace<SessionCreateResult, Passkey>;
  withOtp: <User extends AuthUser>(
    config: WithOtpConfig<User>,
  ) => AuthFull<
    SessionCreateResult,
    SessionRefreshResult,
    Summary,
    User,
    Passkey
  >;
};

/** Sessions plus both authentication strategies; the builder is complete */
export type AuthFull<
  SessionCreateResult,
  SessionRefreshResult,
  Summary extends SessionSummary,
  User extends AuthUser,
  Passkey extends PasskeySummary,
> = {
  session: SessionManagementNamespace<SessionRefreshResult, Summary>;
  otp: OtpNamespace<User, SessionCreateResult>;
  passkey: PasskeyNamespace<SessionCreateResult, Passkey>;
};

/**
 * Candidate dependency-aware builder.
 *
 * This declaration proves the server usage shape only. Runtime orchestration
 * is not implemented in this spike.
 */
export declare function makeAuth<
  SessionCreateResult,
  SessionRefreshResult,
  Summary extends SessionSummary,
>(
  config: MakeAuthConfig<SessionCreateResult, SessionRefreshResult, Summary>,
): Auth<SessionCreateResult, SessionRefreshResult, Summary>;
