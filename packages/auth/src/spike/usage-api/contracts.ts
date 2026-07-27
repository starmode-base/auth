/**
 * Server usage API candidate.
 *
 * Names in this spike are provisional. The contract under examination is the
 * ownership and composition model: makeAuth always has sessions, chained
 * features are complete authentication strategies, core orchestrates their
 * mechanisms and application DIs, and the returned namespaces expose
 * authentication workflows rather than raw ceremony primitives.
 */

/** Expected command result; infrastructure failures throw */
export type Result<T, E extends string> =
  | ([T] extends [void] ? { success: true } : { success: true; data: T })
  | ([E] extends [never] ? never : { success: false; error: E });

/** The authenticated identity shared by every session implementation */
export type SessionIdentity = {
  userId: string;
};

/** Safe session metadata exposed by session management */
export type SessionSummary = {
  sessionId: string;
};

/**
 * Complete injected session implementation.
 *
 * The implementation owns credential types, lifetime policy, persistence,
 * transport, and mechanism. Invocation-scoped environment access is closed
 * over when the adapter is constructed; no framework context enters the
 * public usage API.
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

/** OTP record exchanged with storage; it does not prescribe a schema */
export type OtpRecord = {
  identifier: string;
  otp: string;
  expiresAt: Date;
};

/** OTP mechanism storage */
export type OtpStorage = {
  store: (record: OtpRecord) => Promise<void>;
  /** A verification attempt consumes the OTP */
  verify: (identifier: string, otp: string) => Promise<boolean>;
};

/** Out-of-band OTP delivery */
export type OtpDelivery = {
  send: (identifier: string, otp: string) => Promise<void>;
};

/** Minimum application user established by an authentication strategy */
export type AuthUser = {
  userId: string;
};

/**
 * Complete literal configuration for OTP authentication.
 *
 * authorizeRequest decides whether an OTP may be issued. A denial is not
 * revealed by request's result. resolveUser runs only after OTP verification;
 * null denies authentication. Core then creates the session for the returned
 * userId. Applications may return additional data such as isNew.
 */
export type WithOtpConfig<User extends AuthUser> = {
  storage: OtpStorage;
  delivery: OtpDelivery;
  generateOtp: () => string;
  ttl: number;
  authorizeRequest: (args: { identifier: string }) => Promise<boolean>;
  resolveUser: (args: { identifier: string }) => Promise<User | null>;
};

/** Result of the provisional orchestrated OTP authentication operation */
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

/**
 * OTP authentication workflows.
 *
 * The independently exported OTP primitive may use request and verify names.
 * This namespace deliberately names the operation authenticate because it
 * resolves an application user and establishes a session.
 */
export type OtpNamespace<User extends AuthUser, SessionCreateResult> = {
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
  authenticate: (args: {
    identifier: string;
    otp: string;
  }) => Promise<OtpAuthenticateResult<User, SessionCreateResult>>;
};

/** Passkey credential exchanged with storage */
export type CredentialRecord = {
  credentialId: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: AuthenticatorTransport[] | null;
};

/** Safe passkey metadata returned by management operations */
export type PasskeySummary = {
  credentialId: string;
  transports: AuthenticatorTransport[] | null;
};

/**
 * Passkey credential storage.
 *
 * delete must scope deletion to userId and return false when credentialId is
 * absent or belongs to another user.
 */
export type CredentialStorage = {
  store: (record: CredentialRecord) => Promise<void>;
  get: (credentialId: string) => Promise<CredentialRecord | null>;
  list: (userId: string) => Promise<CredentialRecord[]>;
  setCounter: (credentialId: string, counter: number) => Promise<void>;
  delete: (userId: string, credentialId: string) => Promise<boolean>;
};

/** The two registration workflows have different session consequences */
export type RegistrationIntent = "sign-up" | "add";

/** Single-use WebAuthn challenge state */
export type ChallengeRecord = {
  challenge: string;
  userId: string | null;
  registrationIntent: RegistrationIntent | null;
  expiresAt: Date;
};

/** Single-use challenge storage */
export type ChallengeStorage = {
  store: (record: ChallengeRecord) => Promise<void>;
  /** Atomic fetch-and-delete */
  take: (challenge: string) => Promise<ChallengeRecord | null>;
};

/** WebAuthn relying-party identity */
export type WebAuthnConfig = {
  rpId: string;
  rpName: string;
  allowedOrigins: string[];
};

/** Application identity required to create registration options */
export type PasskeyUser = {
  userId: string;
  identifier: string | null;
};

/** Verified data persisted after registration */
export type VerifiedRegistrationCredential = {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: AuthenticatorTransport[] | null;
};

/** Verified authentication data persisted after an assertion */
export type VerifiedAuthenticationCredential = {
  counter: number;
};

/**
 * Complete literal configuration for passkey authentication and management.
 *
 * Core owns registration, authentication, session establishment, current-user
 * scoping, and management sequencing. These DIs provide application identity,
 * policy, persistence, challenge generation, and WebAuthn verification.
 */
export type WithPasskeyConfig = {
  storage: CredentialStorage;
  challenge: {
    storage: ChallengeStorage;
    ttl: number;
  };
  webAuthn: WebAuthnConfig;
  generateChallenge: () => string;
  createUser: () => Promise<PasskeyUser | null>;
  getUser: (userId: string) => Promise<PasskeyUser | null>;
  authorizeRegistration: (args: {
    userId: string;
    intent: RegistrationIntent;
  }) => Promise<boolean>;
  authorizeAuthentication: (args: { userId: string }) => Promise<boolean>;
  authorizeRemoval: (args: {
    userId: string;
    credentialId: string;
    credentialCount: number;
  }) => Promise<boolean>;
  verifyRegistrationCredential: (args: {
    credential: RegistrationResponseJSON;
    challenge: string;
    webAuthn: WebAuthnConfig;
  }) => Promise<VerifiedRegistrationCredential | null>;
  verifyAuthenticationCredential: (args: {
    credential: AuthenticationResponseJSON;
    challenge: string;
    stored: CredentialRecord;
    webAuthn: WebAuthnConfig;
  }) => Promise<VerifiedAuthenticationCredential | null>;
};

/** Result of completing either passkey registration workflow */
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
export type PasskeyNamespace<SessionCreateResult> = {
  /** Begins passkey-first signup using createUser */
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
  /** Challenge state determines whether completion signs in or adds a passkey */
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
  list: () => Promise<Result<PasskeySummary[], "not_authenticated">>;
  /** Removes only an owned passkey after authorizeRemoval permits it */
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
  withPasskey: (
    config: WithPasskeyConfig,
  ) => AuthPasskey<SessionCreateResult, SessionRefreshResult, Summary>;
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
  withPasskey: (
    config: WithPasskeyConfig,
  ) => AuthFull<SessionCreateResult, SessionRefreshResult, Summary, User>;
};

/** Sessions plus passkey authentication; OTP may still be installed */
export type AuthPasskey<
  SessionCreateResult,
  SessionRefreshResult,
  Summary extends SessionSummary,
> = {
  session: SessionManagementNamespace<SessionRefreshResult, Summary>;
  passkey: PasskeyNamespace<SessionCreateResult>;
  withOtp: <User extends AuthUser>(
    config: WithOtpConfig<User>,
  ) => AuthFull<SessionCreateResult, SessionRefreshResult, Summary, User>;
};

/** Sessions plus both authentication strategies; the builder is complete */
export type AuthFull<
  SessionCreateResult,
  SessionRefreshResult,
  Summary extends SessionSummary,
  User extends AuthUser,
> = {
  session: SessionManagementNamespace<SessionRefreshResult, Summary>;
  otp: OtpNamespace<User, SessionCreateResult>;
  passkey: PasskeyNamespace<SessionCreateResult>;
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
