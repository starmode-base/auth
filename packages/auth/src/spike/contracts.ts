/**
 * ΛUTH contracts — the typed API spec.
 *
 * Everything user code touches: adapter interfaces, config shapes, method
 * namespaces, auth shapes, and factory signatures. Source of intent while
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
 * - *Credential / *JSON — WebAuthn wire shapes mirroring the browser API
 *
 * Adapter roles:
 * - Storage — persistence the user owns
 * - Codec — token format (encode/decode)
 * - Transport — how the session token rides on requests (cookie, header)
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
 * - absence is null, never undefined; nullable, never optional (wire types excepted)
 * - expiry: expiresAt dates and expired flags, scoped by their object
 * - ttl: a duration in ms — unit policy on unit configs; mechanism TTLs live in their factories, off the SPI
 * - API methods take one args object; adapter methods take positional args
 */

/** Error codes for auth failures */
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
 * The token's trust status, as read by decode. expiresAt is the trust
 * horizon: how long the carried record may be trusted without consulting
 * storage. Self-contained tokens embed it; lookup codecs report now — their
 * trust is per-decode, so expired is never true.
 */
export type TokenStatus = {
  expiresAt: Date;
  /** expiresAt < now, computed by the codec — the codec owns the token clock */
  expired: boolean;
};

/* ────────────────────────────────────────────────────────────────────────
 * Session — the core. Records → adapters → config → namespace → results.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Session record — the session's exchange shape: what SessionStorage stores
 * and the session token carries. Not a stored schema: storage maps it to and
 * from its own representation; reads must return records equivalent to what
 * store received.
 */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  /** null = never expires */
  expiresAt: Date | null;
};

/** Session storage adapter — plain reads and writes; core enforces expiry */
export type SessionStorage = {
  store: (record: SessionRecord) => Promise<void>;
  get: (sessionId: string) => Promise<SessionRecord | null>;
  delete: (sessionId: string) => Promise<void>;
};

/** Decoded session token. Invalid or forged tokens decode to null. */
export type SessionDecoded = {
  /** The session record the token carries or resolves to */
  record: SessionRecord;
  /** Expiry is fixed (the revocation window); expired forces the storage revocation check */
  token: TokenStatus;
};

/**
 * Session codec — token format (HMAC, opaque, or bring a JWT library).
 * Self-contained tokens carry the session record; reference (opaque) tokens
 * resolve it via lookup. Storage remains the authority on revocation. The
 * token TTL is the codec factory's own config — never core's.
 */
export type SessionCodec = {
  /** token.expiresAt: null mints a fresh horizon from the codec's own TTL; a Date preserves the existing horizon (sliding refresh) */
  encode: (
    record: SessionRecord,
    token: { expiresAt: Date | null },
  ) => Promise<string>;
  decode: (token: string) => Promise<SessionDecoded | null>;
};

/** Session transport — how the token rides on requests (cookie, header) */
export type SessionTransport = {
  /** Read token from the incoming request */
  get: () => string | null;
  /** Store token and return what goes in the response body */
  set: (token: string) => string;
  /** Clear the stored token */
  clear: () => void;
};

/** Config for makeAuth — the session core */
export type MakeAuthConfig = {
  storage: SessionStorage;
  codec: SessionCodec;
  transport: SessionTransport;
  /** Session TTL in ms (Infinity = forever). Inactivity timeout with sliding refresh. */
  ttl: number;
  debug: boolean;
};

/** Session methods — the core namespace, present at every step */
export type SessionNamespace = {
  /**
   * Creates a session for the given user. Success data is the session token
   * — also delivered via the session transport; returned for header-based
   * clients.
   */
  create: (args: { userId: string }) => Promise<Result<string, never>>;
  get: () => Promise<{ userId: string } | null>;
  /** Ends the current session (signs the user out) */
  end: () => Promise<Result<void, never>>;
};

/* ────────────────────────────────────────────────────────────────────────
 * OTP — identity verification, optionally authentication.
 * ──────────────────────────────────────────────────────────────────────── */

/** Otp record — the shape exchanged with otp storage, not a stored schema */
export type OtpRecord = {
  /** Identifier (email address, phone number, etc.) */
  identifier: string;
  otp: string;
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
  /** One attempt per otp: a wrong guess consumes it */
  verify: (identifier: string, otp: string) => Promise<boolean>;
};

/**
 * Input for makeOtpStorage: otp storage as two primitives. take must be
 * atomic — fetch and delete in one operation (e.g. DELETE … RETURNING,
 * GETDEL).
 */
export type MakeOtpStorageConfig = {
  store: (record: OtpRecord) => Promise<void>;
  /** Atomic fetch-and-delete. Unknown identifier returns null. */
  take: (identifier: string) => Promise<OtpRecord | null>;
};

/** Builds a correct OtpStorage (expiry, comparison, one-time use) from store/take */
export declare function makeOtpStorage(
  config: MakeOtpStorageConfig,
): OtpStorage;

/** OTP delivery adapter (email, SMS, console) */
export type OtpDelivery = {
  send: (identifier: string, otp: string) => Promise<void>;
};

/** Config for withOtp */
export type WithOtpConfig = {
  storage: OtpStorage;
  delivery: OtpDelivery;
  /** Otp validity duration in ms — core stamps OtpRecord.expiresAt from it */
  ttl: number;
};

/** Otp methods — added as the `otp` namespace by withOtp */
export type OtpNamespace = {
  /**
   * Sends an otp to the identifier. Never reveals whether delivery
   * succeeded (enumeration safety).
   */
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
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
  expiresAt: Date;
};

/** Challenge storage adapter. Challenges are single-use. */
export type ChallengeStorage = {
  store: (record: ChallengeRecord) => Promise<void>;
  /** Atomic fetch-and-delete. Unknown challenge returns null. */
  take: (challenge: string) => Promise<ChallengeRecord | null>;
};

/**
 * A grant to register a passkey: the user it belongs to, and the identifier
 * shown in the passkey picker (user.name; null for identifier-less sign-up
 * in passkey-only apps).
 */
export type RegistrationGrant = {
  userId: string;
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
 * that horizon.
 */
export type RegistrationCodec = {
  encode: (grant: RegistrationGrant) => Promise<string>;
  decode: (token: string) => Promise<RegistrationDecoded | null>;
};

/** WebAuthn protocol identity — who the relying party is and which origins may speak for it */
export type WebAuthnConfig = {
  rpId: string;
  rpName: string;
  /**
   * Exact allowed origins, scheme + host + port — e.g. ["https://app.example.com"].
   * Matched exactly against clientDataJSON.origin: no wildcards, no subdomain
   * logic, never inferred from rpId.
   */
  allowedOrigins: string[];
};

/** Config for withPasskey */
export type WithPasskeyConfig = {
  storage: CredentialStorage;
  challengeStorage: ChallengeStorage;
  registrationCodec: RegistrationCodec;
  webAuthn: WebAuthnConfig;
  /** Challenge validity duration in ms — core stamps ChallengeRecord.expiresAt from it */
  challengeTtl: number;
};

/* Wire types — WebAuthn JSON for transport between browser and server.
 * These mirror the browser API; optionality follows the WebAuthn spec. */

export type PublicKeyCredentialCreationOptionsJSON = {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  excludeCredentials?: { id: string; type: "public-key" }[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  // extensions omitted — add when PRF support is implemented
};

export type PublicKeyCredentialRequestOptionsJSON = {
  challenge: string;
  rpId: string;
  timeout?: number;
  allowCredentials?: { id: string; type: "public-key" }[];
  userVerification?: UserVerificationRequirement;
  // extensions omitted — add when PRF support is implemented
};

export type RegistrationCredential = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: AuthenticatorTransport[] | undefined;
  };
  authenticatorAttachment?: AuthenticatorAttachment | undefined;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
};

export type AuthenticationCredential = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string | undefined;
  };
  authenticatorAttachment?: AuthenticatorAttachment | undefined;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
};

/* Results — verification returns the verified userId; sessions are created
 * explicitly via session.create. */

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

export type VerifyRegistrationResult = Result<
  { userId: string },
  | "invalid_token"
  | "challenge_expired"
  | "user_mismatch"
  | "verification_failed"
>;

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
    credential: RegistrationCredential;
  }) => Promise<VerifyRegistrationResult>;
  createAuthenticationOptions: () => Promise<CreateAuthenticationOptionsResult>;
  /** Verifies the assertion against the stored credential. Does not create a session — call session.create. */
  verifyAuthentication: (args: {
    credential: AuthenticationCredential;
  }) => Promise<VerifyAuthenticationResult>;
};

/* ────────────────────────────────────────────────────────────────────────
 * Composition — the builder. Each configured unit adds its namespace.
 * Invalid configurations do not compile.
 * ──────────────────────────────────────────────────────────────────────── */

/** Session-only auth — both strategies still available to chain */
export type AuthCore = {
  session: SessionNamespace;
  withOtp: (config: WithOtpConfig) => AuthCoreOtp;
  withPasskey: (config: WithPasskeyConfig) => AuthCorePasskey;
};

/** Sessions + otp — only withPasskey remains */
export type AuthCoreOtp = {
  session: SessionNamespace;
  otp: OtpNamespace;
  withPasskey: (config: WithPasskeyConfig) => AuthFull;
};

/** Sessions + passkeys — only withOtp remains */
export type AuthCorePasskey = {
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

export declare function makeAuth(config: MakeAuthConfig): AuthCore;
