/**
 * Server usage API candidate.
 *
 * Names in this spike are provisional. The contract under examination is the
 * ownership and composition model: literal objects are the DI contract, the
 * strategy map callback mounts complete authentication strategies under
 * caller chosen names, strategy DIs own feature workflows, and core owns
 * composition, session establishment, and current-user scoping.
 *
 * auth is a module singleton. Construction touches no request. Every
 * operation that uses current session authority receives the presented
 * credential as an argument. The presented credential is a string, whatever
 * value the application extracted from its transport. Created credentials
 * remain mechanism defined values that the application writes back. Direct
 * session creation does not exist. Bespoke authentication is an explicit
 * strategy.
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
  /** Repeatable read-only resolution of the presented session token */
  resolve: (token: string | null) => Promise<Identity | null>;
};

/**
 * Fixed session port used by the authentication microkernel.
 *
 * Core establishes the exact userId returned by a successful authentication
 * strategy and resolves the presented credential when another auth workflow
 * needs current authority. The implementation owns every credential,
 * persistence, transport, lifetime, renewal, and revocation decision behind
 * these two operations. resolve performs no writes; renewal is an explicit
 * capability when the mechanism supports it.
 */
export type SessionKernel<
  Identity extends SessionIdentity,
  CreateResult,
> = SessionResolver<Identity> & {
  establish: (userId: string) => Promise<CreateResult>;
};

/** Capability names reserved for the kernel's public projection */
type ReservedSessionCapability = "get";

/** A public capability set cannot replace the kernel's read projection */
export type SessionCapabilitySet<Capabilities extends object> =
  Extract<keyof Capabilities, ReservedSessionCapability> extends never
    ? Capabilities
    : never;

/**
 * Complete injected session implementation.
 *
 * Capabilities contains complete current-session workflows such as refresh,
 * renewal, revocation, or management. Each capability defines its own
 * signature, including which presented credentials it requires. The set is
 * projected unchanged into the public session namespace. An implementation
 * supplies only the operations its mechanism can perform meaningfully.
 */
export type SessionAdapter<
  Identity extends SessionIdentity,
  CreateResult,
  Capabilities extends object,
> = {
  kernel: SessionKernel<Identity, CreateResult>;
  capabilities: SessionCapabilitySet<Capabilities>;
};

/** Session access plus exactly the configured mechanism capabilities */
export type SessionManagementNamespace<
  Identity extends SessionIdentity,
  Capabilities extends object,
> = {
  get: (token: string | null) => Promise<Identity | null>;
} & SessionCapabilitySet<Capabilities>;

/**
 * Narrow authority a strategy receives while its namespace is constructed.
 *
 * Strategies never receive the session implementation or its capabilities.
 * authenticate establishes a session for exactly the user returned by a
 * successful proof and establishes nothing on failure. current is the same
 * repeatable read-only resolution the public session namespace exposes.
 */
export type StrategyKernel<
  Identity extends SessionIdentity,
  SessionCreateResult,
> = {
  authenticate: <User extends AuthUser, E extends string>(
    prove: () => Promise<Result<User, E>>,
  ) => Promise<
    Result<
      {
        user: User;
        session: SessionCreateResult;
      },
      E
    >
  >;
  current: (token: string | null) => Promise<Identity | null>;
};

/** Auth surface produced by one kernel bound namespace map */
export type Auth<
  Identity extends SessionIdentity,
  Capabilities extends object,
  Namespaces extends Record<string, object>,
> = {
  session: SessionManagementNamespace<Identity, Capabilities>;
  strategies: Namespaces;
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

/** The three registration workflows have different authority and session consequences */
export type RegistrationIntent = "sign-up" | "vouched" | "add";

/**
 * Registration context carried through the ceremony.
 *
 * sign-up founds a new account. vouched attaches to an existing user the
 * application has verified by its own proof; it is minted by a server-side
 * operation only, never from client input. add attaches to the current
 * session's user.
 */
export type RegistrationContext =
  | {
      intent: "sign-up";
      userId: null;
    }
  | {
      intent: "vouched";
      userId: string;
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
 * lifecycle, credential persistence, and counter handling. Its operations are
 * called independently because they span separate public workflows and server
 * requests. Credential management is not part of the strategy; the
 * application manages stored credentials directly.
 *
 * A direct implementation replaces the passkey authentication engine. Helpers
 * may produce this same object from lower-level WebAuthn, challenge, storage,
 * and application-user primitives.
 */
export type WithPasskeyConfig = {
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
};

/** Result of completing any public passkey registration workflow */
export type VerifyRegistrationResult<SessionCreateResult> = Result<
  | {
      intent: "sign-up";
      userId: string;
      session: SessionCreateResult;
    }
  | {
      intent: "vouched";
      userId: string;
      session: SessionCreateResult;
    }
  | {
      intent: "add";
      userId: string;
    },
  | "registration_disabled"
  | "challenge_expired"
  | "verification_failed"
  | "not_authenticated"
  | "user_mismatch"
>;

/**
 * Passkey authentication workflows.
 *
 * Operations that use current-user authority receive the presented session
 * token as their first positional argument. The strategy derives userId from
 * that authority and never accepts an arbitrary public userId.
 */
export type PasskeyNamespace<SessionCreateResult> = {
  /** Begins passkey-first signup */
  createRegistrationOptions: () => Promise<
    Result<PublicKeyCredentialCreationOptionsJSON, "registration_disabled">
  >;
  /**
   * Begins registration for a user the application has verified by its own
   * proof (OTP, invite), with no session in play. Server-side only: the
   * userId must come from the application's verification, never from client
   * input. Completion establishes a session.
   */
  createVouchedRegistrationOptions: (args: {
    userId: string;
  }) => Promise<
    Result<PublicKeyCredentialCreationOptionsJSON, "registration_disabled">
  >;
  /** Begins adding a passkey for the authenticated user */
  createAdditionalRegistrationOptions: (
    token: string | null,
  ) => Promise<
    Result<
      PublicKeyCredentialCreationOptionsJSON,
      "not_authenticated" | "registration_disabled"
    >
  >;
  /** The strategy result determines whether completion signs in or adds */
  verifyRegistration: (
    token: string | null,
    args: { credential: RegistrationResponseJSON },
  ) => Promise<VerifyRegistrationResult<SessionCreateResult>>;
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
};

/**
 * Candidate constructor. Session adapter first, strategy map callback second.
 *
 * The callback receives the narrow strategy kernel and returns the final
 * named namespace map. Namespace names are caller chosen literal keys that
 * core never enumerates. The partial runtime candidate lives in
 * make-auth-sandbox.ts.
 */
export declare function makeAuth<
  Identity extends SessionIdentity,
  SessionCreateResult,
  Capabilities extends object,
  const Namespaces extends Record<string, object>,
>(
  session: SessionAdapter<Identity, SessionCreateResult, Capabilities>,
  strategies: (
    kernel: StrategyKernel<NoInfer<Identity>, NoInfer<SessionCreateResult>>,
  ) => Namespaces,
): Auth<Identity, Capabilities, Namespaces>;
