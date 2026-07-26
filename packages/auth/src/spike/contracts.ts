/**
 * ΛUTH contracts — the typed API spec.
 *
 * Everything user code touches: adapter interfaces, config shapes, method
 * namespaces, auth shapes, and the factory signature. Source of intent while
 * the API is finalized. Verified by contracts-typecheck.ts and exercised by
 * playground.ts.
 */

/* ────────────────────────────────────────────────────────────────────────
 * Shared vocabulary
 * ──────────────────────────────────────────────────────────────────────── */

/*
 * Vocabulary
 *
 * Type suffixes, by boundary:
 * - *Record — shape exchanged with a storage adapter; never a stored schema
 * - *Decoded — what decode returns: what the token carries (record, grant) plus its TokenStatus
 * - *Config — input to a factory or builder step, named for its consumer
 * - *Namespace — the methods a builder step adds; *Result — a command's envelope
 * - *JSON — WebAuthn wire shapes, ambient from lib.dom; never redeclared here
 *
 * Adapter roles:
 * - Session — complete session lifecycle and credential policy
 * - Storage — persistence the user owns
 * - Codec — token format (encode/decode)
 * - Delivery — out-of-band send to the user (email, SMS, console)
 *
 * Adapter verbs:
 * - store — upsert by the record's key
 * - get — read by key; take — atomic fetch-and-delete; both null when absent
 * - list — all records for a key
 * - set* — plain overwrite, never read-modify-write
 * - verify — check and consume (single-use); send — deliver out of band
 * - encode / decode — mint and read tokens; invalid tokens decode to null
 *
 * Method verbs:
 * - verify — checks and consumes a single-use artifact
 * - validate — repeatable check, consumes nothing
 *
 * Field rules:
 * - absence is null, never undefined; nullable, never optional
 * - expiry: expiresAt dates and expired flags, scoped by their object
 * - ttl: a duration in ms — unit policy on unit configs; mechanism TTLs live in their factories, off the SPI
 * - API methods take one args object; adapter methods take positional args
 */

export type AuthErrorCode =
  | "invalid_otp"
  | "invalid_token"
  | "challenge_expired"
  | "user_mismatch"
  | "credential_not_found"
  | "verification_failed"
  /** Wire-level only (REST handler); never returned by auth methods */
  | "invalid_request"
  /** Wire-level only (REST handler); never returned by auth methods */
  | "internal_error";

/**
 * Command result. Expected failures — including malformed client input —
 * are values the caller branches on; E lists exactly the failures the
 * command can produce, and E = never collapses the type to an always-success
 * envelope. T rides in data; T = void drops the field for commands that
 * return nothing. Queries return the value or null instead: absence is not
 * failure. Infrastructure failures throw.
 */
export type Result<T, E extends AuthErrorCode> =
  | ([T] extends [void] ? { success: true } : { success: true; data: T })
  | ([E] extends [never] ? never : { success: false; error: E });

/**
 * A token's expiry status, as read by decode. Expiry does not make decode
 * return null; the operation consuming the decoded token decides whether an
 * expired token is usable.
 */
export type TokenStatus = {
  /** The token's expiry */
  expiresAt: Date;
  /** expiresAt < now, computed by the codec */
  expired: boolean;
};

/* ────────────────────────────────────────────────────────────────────────
 * Session — the core.
 * ──────────────────────────────────────────────────────────────────────── */

/** Credentials issued when a session is created or refreshed */
export type IssuedSessionCredentials = {
  accessToken: string;
  /** null when the session mechanism uses no separate refresh token */
  refreshToken: string | null;
};

/** Access and refresh tokens received from the client */
export type PresentedSessionCredentials = {
  accessToken: string | null;
  refreshToken: string | null;
};

/** The authenticated identity established by a session */
export type SessionIdentity = {
  /** Opaque application-owned identifier; the auth library does not manage users */
  userId: string;
};

/**
 * Complete session lifecycle adapter.
 *
 * The application authorizes the userId passed to create. The adapter owns
 * session policy, credential mechanics, persistence, and revocation. It does
 * not read or write credential transports such as cookies or headers.
 */
export type SessionAdapter = {
  create: (userId: string) => Promise<IssuedSessionCredentials>;
  /** Repeatable read-only validation; invalid credentials return null */
  validate: (
    credentials: PresentedSessionCredentials,
  ) => Promise<SessionIdentity | null>;
  /** Invalid or unusable credentials return null */
  refresh: (
    credentials: PresentedSessionCredentials,
  ) => Promise<IssuedSessionCredentials | null>;
  end: (credentials: PresentedSessionCredentials) => Promise<void>;
};

/** Config for makeAuth — the session unit named explicitly, since the function name can't */
export type MakeAuthConfig = {
  session: SessionAdapter;
  /** Log expected auth failures to the console (development aid) */
  debug: boolean;
};

/** Session methods — the core namespace, present at every step */
export type SessionNamespace = {
  /** Creates a session for an application-authorized userId */
  create: (args: {
    userId: string;
  }) => Promise<Result<IssuedSessionCredentials, never>>;
  /** Validates presented session credentials without consuming them */
  validate: (args: {
    credentials: PresentedSessionCredentials;
  }) => Promise<SessionIdentity | null>;
  /** Refreshes a session and returns the credentials the application must persist */
  refresh: (args: {
    credentials: PresentedSessionCredentials;
  }) => Promise<Result<IssuedSessionCredentials, "invalid_token">>;
  /** Ends the session identified by the presented credentials */
  end: (args: {
    credentials: PresentedSessionCredentials;
  }) => Promise<Result<void, never>>;
};

/* ────────────────────────────────────────────────────────────────────────
 * OTP — identity verification, optionally authentication.
 * ──────────────────────────────────────────────────────────────────────── */

/** OTP record — the shape exchanged with OTP storage, not a stored schema */
export type OtpRecord = {
  /** Identifier (email address, phone number, etc.) */
  identifier: string;
  otp: string;
  /** Stamped by core from WithOtpConfig.ttl */
  expiresAt: Date;
};

/**
 * OTP storage adapter.
 *
 * Implementations must guarantee expiry, comparison, and one-time use. Use
 * makeOtpStorage to build these guarantees from two primitives, or implement
 * verify directly (e.g. delegated verification via a provider's check
 * endpoint).
 */
export type OtpStorage = {
  store: (record: OtpRecord) => Promise<void>;
  /** One attempt per OTP: a wrong guess consumes it */
  verify: (identifier: string, otp: string) => Promise<boolean>;
};

/** OTP delivery adapter (email, SMS, console) */
export type OtpDelivery = {
  send: (identifier: string, otp: string) => Promise<void>;
};

/** Config for withOtp */
export type WithOtpConfig = {
  storage: OtpStorage;
  delivery: OtpDelivery;
  /** OTP validity duration in ms — core stamps OtpRecord.expiresAt from it */
  ttl: number;
};

/** OTP methods — added as the `otp` namespace by withOtp */
export type OtpNamespace = {
  /**
   * Sends an OTP to the identifier. Never reveals whether delivery
   * succeeded (enumeration safety).
   */
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
  /** A wrong OTP consumes it — the user starts over with a fresh request */
  verify: (args: {
    identifier: string;
    otp: string;
  }) => Promise<Result<void, "invalid_otp">>;
};

/* ────────────────────────────────────────────────────────────────────────
 * Passkey — WebAuthn authentication.
 * ──────────────────────────────────────────────────────────────────────── */

/** Credential record — the shape exchanged with CredentialStorage, not a stored schema */
export type CredentialRecord = {
  credentialId: string;
  userId: string;
  publicKey: Uint8Array;
  /** WebAuthn signature counter (clone detection) */
  counter: number;
  /** null = the client reported no transport hints */
  transports: AuthenticatorTransport[] | null;
};

/** Credential (passkey) storage adapter */
export type CredentialStorage = {
  store: (record: CredentialRecord) => Promise<void>;
  get: (credentialId: string) => Promise<CredentialRecord | null>;
  /** All credentials belonging to the user */
  list: (userId: string) => Promise<CredentialRecord[]>;
  /** Persist the WebAuthn signature counter after authentication (clone detection) */
  setCounter: (credentialId: string, counter: number) => Promise<void>;
};

/** WebAuthn challenge record (single-use) */
export type ChallengeRecord = {
  challenge: string;
  /** Set for registration ceremonies, null for authentication */
  userId: string | null;
  /** Stamped by core from WithPasskeyConfig.challenge.ttl */
  expiresAt: Date;
};

/** Challenge storage adapter. Challenges are single-use. */
export type ChallengeStorage = {
  store: (record: ChallengeRecord) => Promise<void>;
  /** Atomic fetch-and-delete. Unknown challenge returns null. */
  take: (challenge: string) => Promise<ChallengeRecord | null>;
};

/** A grant to register a passkey */
export type RegistrationGrant = {
  userId: string;
  /** Shown in the passkey picker (user.name); null for identifier-less sign-up (passkey-only apps) */
  identifier: string | null;
};

/** Decoded registration token. Invalid or forged tokens decode to null. */
export type RegistrationDecoded = {
  /** The grant the token carries */
  grant: RegistrationGrant;
  /** Expired tokens must be rejected */
  token: TokenStatus;
};

/**
 * Registration codec (short-lived token authorizing passkey registration).
 * The validity window is the codec factory's own config; encode mints at
 * that expiry.
 */
export type RegistrationCodec = {
  encode: (grant: RegistrationGrant) => Promise<string>;
  decode: (token: string) => Promise<RegistrationDecoded | null>;
};

/** WebAuthn protocol identity — who the relying party is and which origins may speak for it */
export type WebAuthnConfig = {
  /** Relying party id — the registrable domain passkeys are bound to */
  rpId: string;
  /** Human-readable app name shown by authenticators */
  rpName: string;
  /**
   * Exact allowed origins, scheme + host + port — e.g. ["https://app.example.com"].
   * Matched exactly against clientDataJSON.origin: no wildcards, no subdomain
   * logic, never inferred from rpId.
   */
  allowedOrigins: string[];
};

/** Config for the passkey unit's challenges */
export type ChallengeConfig = {
  storage: ChallengeStorage;
  /** Challenge validity duration in ms — core stamps ChallengeRecord.expiresAt from it */
  ttl: number;
};

/** Config for withPasskey */
export type WithPasskeyConfig = {
  storage: CredentialStorage;
  registrationCodec: RegistrationCodec;
  webAuthn: WebAuthnConfig;
  challenge: ChallengeConfig;
};

/** Success data is the registration token */
export type CreateRegistrationTokenResult = Result<string, never>;

/** Success data is the grant the token carries */
export type ValidateRegistrationTokenResult = Result<
  RegistrationGrant,
  "invalid_token"
>;

/** Success data is the WebAuthn creation options */
export type CreateRegistrationOptionsResult = Result<
  PublicKeyCredentialCreationOptionsJSON,
  "invalid_token"
>;

/** Success data is the WebAuthn request options */
export type CreateAuthenticationOptionsResult = Result<
  PublicKeyCredentialRequestOptionsJSON,
  never
>;

/** Success data is the verified userId */
export type VerifyRegistrationResult = Result<
  { userId: string },
  | "invalid_token"
  | "challenge_expired"
  | "user_mismatch"
  | "verification_failed"
>;

/** Success data is the verified userId */
export type VerifyAuthenticationResult = Result<
  { userId: string },
  "credential_not_found" | "challenge_expired" | "verification_failed"
>;

/** Passkey methods — added as the `passkey` namespace by withPasskey */
export type PasskeyNamespace = {
  createRegistrationToken: (
    args: RegistrationGrant,
  ) => Promise<CreateRegistrationTokenResult>;
  validateRegistrationToken: (args: {
    registrationToken: string;
  }) => Promise<ValidateRegistrationTokenResult>;
  createRegistrationOptions: (args: {
    registrationToken: string;
  }) => Promise<CreateRegistrationOptionsResult>;
  /** Verifies and stores the credential. Does not create a session — call session.create. */
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationResponseJSON;
  }) => Promise<VerifyRegistrationResult>;
  createAuthenticationOptions: () => Promise<CreateAuthenticationOptionsResult>;
  /** Verifies the assertion against the stored credential. Does not create a session — call session.create. */
  verifyAuthentication: (args: {
    credential: AuthenticationResponseJSON;
  }) => Promise<VerifyAuthenticationResult>;
};

/* ────────────────────────────────────────────────────────────────────────
 * Composition — the builder. Each configured unit adds its namespace.
 * Invalid configurations do not compile.
 * ──────────────────────────────────────────────────────────────────────── */

/** Session-only auth — both strategies still available to chain */
export type Auth = {
  session: SessionNamespace;
  withOtp: (config: WithOtpConfig) => AuthOtp;
  withPasskey: (config: WithPasskeyConfig) => AuthPasskey;
};

/** Sessions + OTP — only withPasskey remains */
export type AuthOtp = {
  session: SessionNamespace;
  otp: OtpNamespace;
  withPasskey: (config: WithPasskeyConfig) => AuthFull;
};

/** Sessions + passkeys — only withOtp remains */
export type AuthPasskey = {
  session: SessionNamespace;
  passkey: PasskeyNamespace;
  withOtp: (config: WithOtpConfig) => AuthFull;
};

/** Everything configured — nothing left to chain */
export type AuthFull = {
  session: SessionNamespace;
  otp: OtpNamespace;
  passkey: PasskeyNamespace;
};

/** The entry point — builds the session core; chain withOtp and withPasskey to add strategies */
export declare function makeAuth(config: MakeAuthConfig): Auth;
