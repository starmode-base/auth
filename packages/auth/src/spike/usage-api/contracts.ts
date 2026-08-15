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

/** Minimum authenticated identity established by every session implementation */
export type SessionIdentity = {
  userId: string;
};

/** Read-only session port used to resolve current auth authority */
export type SessionResolver<Identity extends SessionIdentity> = {
  /** Repeatable read-only resolution of the presented session */
  resolve: () => Promise<Identity | null>;
};

/**
 * Fixed session port used by the authentication microkernel.
 *
 * Core establishes the exact userId returned by a successful authentication
 * strategy and resolves the current identity when another auth workflow needs
 * that authority. The implementation owns every credential, persistence,
 * transport, lifetime, renewal, and revocation decision behind these two
 * operations.
 */
export type SessionKernel<
  Identity extends SessionIdentity,
  CreateResult,
> = SessionResolver<Identity> & {
  establish: (userId: string) => Promise<CreateResult>;
};

/** Capability names reserved for the kernel's public projections */
type ReservedSessionCapability = "create" | "get";

/** A public capability set cannot bypass or replace the kernel projections */
export type SessionCapabilitySet<Capabilities extends object> =
  Extract<keyof Capabilities, ReservedSessionCapability> extends never
    ? Capabilities
    : never;

/**
 * Invocation-bound read-only session implementation.
 *
 * A binding closes over presented credentials and read capabilities, then
 * supplies only the public operations valid in that invocation. Since this
 * projection cannot establish sessions, it cannot install authentication
 * strategies or expose direct session creation.
 */
export type SessionReader<
  Identity extends SessionIdentity,
  Capabilities extends object,
> = {
  kernel: SessionResolver<Identity>;
  capabilities: SessionCapabilitySet<Capabilities>;
};

/**
 * Complete injected session implementation.
 *
 * Capabilities contains complete current-session workflows such as refresh,
 * renewal, revocation, or management. It accepts no arbitrary userId and is
 * projected unchanged into the public session namespace. An implementation
 * supplies only the operations its mechanism can perform meaningfully.
 */
export type SessionAdapter<
  Identity extends SessionIdentity,
  CreateResult,
  Capabilities extends object,
> = {
  kernel: SessionKernel<Identity, CreateResult>;
  /** TODO: Documentation */
  capabilities: SessionCapabilitySet<Capabilities>;
};

/** Session access plus exactly the configured mechanism capabilities */
export type SessionManagementNamespace<
  Identity extends SessionIdentity,
  Capabilities extends object,
> = {
  get: () => Promise<Identity | null>;
} & SessionCapabilitySet<Capabilities>;

/**
 * Session-only namespace.
 *
 * create is the escape hatch for applications implementing a custom
 * authentication strategy. Installed strategies retain create internally and
 * remove it from their ordinary public usage surface.
 */
export type SessionNamespace<
  Identity extends SessionIdentity,
  CreateResult,
  Capabilities extends object,
> = SessionManagementNamespace<Identity, Capabilities> & {
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
  Identity extends SessionIdentity,
  CreateResult,
  Capabilities extends object,
> = {
  debug: boolean;
  session: SessionAdapter<Identity, CreateResult, Capabilities>;
};

/** makeAuth config for an invocation that can only read session state */
export type MakeAuthReaderConfig<
  Identity extends SessionIdentity,
  Capabilities extends object,
> = {
  debug: boolean;
  session: SessionReader<Identity, Capabilities>;
};

/** Read-only auth projection with no authentication strategy builder */
export type AuthReader<
  Identity extends SessionIdentity,
  SessionCapabilities extends object,
> = {
  session: SessionManagementNamespace<Identity, SessionCapabilities>;
};

/** Sessions configured; either authentication strategy may be installed */
export type Auth<
  Identity extends SessionIdentity,
  SessionCreateResult,
  SessionCapabilities extends object,
> = {
  session: SessionNamespace<Identity, SessionCreateResult, SessionCapabilities>;
  withOtp: <User extends AuthUser>(
    config: WithOtpConfig<User>,
  ) => AuthOtp<Identity, SessionCreateResult, SessionCapabilities, User>;
  withPasskey: <Passkey extends PasskeySummary>(
    config: WithPasskeyConfig<Passkey>,
  ) => AuthPasskey<Identity, SessionCreateResult, SessionCapabilities, Passkey>;
};

/** Sessions plus OTP authentication; passkeys may still be installed */
export type AuthOtp<
  Identity extends SessionIdentity,
  SessionCreateResult,
  SessionCapabilities extends object,
  User extends AuthUser,
> = {
  session: SessionManagementNamespace<Identity, SessionCapabilities>;
  otp: OtpNamespace<User, SessionCreateResult>;
  withPasskey: <Passkey extends PasskeySummary>(
    config: WithPasskeyConfig<Passkey>,
  ) => AuthFull<
    Identity,
    SessionCreateResult,
    SessionCapabilities,
    User,
    Passkey
  >;
};

/** Sessions plus passkey authentication; OTP may still be installed */
export type AuthPasskey<
  Identity extends SessionIdentity,
  SessionCreateResult,
  SessionCapabilities extends object,
  Passkey extends PasskeySummary,
> = {
  session: SessionManagementNamespace<Identity, SessionCapabilities>;
  passkey: PasskeyNamespace<SessionCreateResult, Passkey>;
  withOtp: <User extends AuthUser>(
    config: WithOtpConfig<User>,
  ) => AuthFull<
    Identity,
    SessionCreateResult,
    SessionCapabilities,
    User,
    Passkey
  >;
};

/** Sessions plus both authentication strategies; the builder is complete */
export type AuthFull<
  Identity extends SessionIdentity,
  SessionCreateResult,
  SessionCapabilities extends object,
  User extends AuthUser,
  Passkey extends PasskeySummary,
> = {
  session: SessionManagementNamespace<Identity, SessionCapabilities>;
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
  Identity extends SessionIdentity,
  SessionCreateResult,
  SessionCapabilities extends object,
>(
  config: MakeAuthConfig<Identity, SessionCreateResult, SessionCapabilities>,
): Auth<Identity, SessionCreateResult, SessionCapabilities>;

export declare function makeAuth<
  Identity extends SessionIdentity,
  SessionCapabilities extends object,
>(
  config: MakeAuthReaderConfig<Identity, SessionCapabilities>,
): AuthReader<Identity, SessionCapabilities>;

export const auth = makeAuth({
  debug: true,
  session: {
    capabilities: { x: 1 },
    kernel: {
      establish(userId) {
        return Promise.resolve({ success: true, data: { userId } });
      },
      resolve() {
        return Promise.resolve(null);
      },
    },
  },
});
