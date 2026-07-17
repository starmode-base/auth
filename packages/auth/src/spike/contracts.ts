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
 * envelope. Queries return the value or null instead: absence is not
 * failure. Infrastructure failures throw.
 */
export type Result<T extends object, E extends AuthErrorCode> = [E] extends [
  never,
]
  ? { success: true } & T
  : ({ success: true } & T) | { success: false; error: E };

/* ────────────────────────────────────────────────────────────────────────
 * Session — the core. Records → adapters → config → namespace → results.
 * ──────────────────────────────────────────────────────────────────────── */

/** Session DB record */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  /** null = never expires */
  expiresAt: Date | null;
};

/** Session storage adapter — plain reads and writes; core enforces expiry */
export type SessionStorage = {
  /** Upsert */
  store: (record: SessionRecord) => Promise<void>;
  get: (sessionId: string) => Promise<SessionRecord | null>;
  delete: (sessionId: string) => Promise<void>;
  /** Delete all sessions belonging to the same user as this session */
  deleteAll: (sessionId: string) => Promise<void>;
};

/** Session token payload */
export type SessionPayload = {
  sessionId: string;
  /** Session expiry (null = never expires). Slides on every request. */
  sessionExp: Date | null;
  userId: string;
};

/** Decoded session token. Invalid or forged tokens decode to null. */
export type SessionDecoded = SessionPayload & {
  /** Token expiration (fixed — the revocation window) */
  exp: Date;
  /** Token expired (exp < now) — forces the storage revocation check */
  expired: boolean;
};

/** Session codec — token format (HMAC, opaque, or bring a JWT library) */
export type SessionCodec = {
  /** expiresAt: null mints a fresh token TTL; a Date preserves an existing expiry (sliding refresh) */
  encode: (
    payload: SessionPayload,
    options: { expiresAt: Date | null },
  ) => Promise<string>;
  decode: (token: string) => Promise<SessionDecoded | null>;
  /** Token TTL in ms — the revocation window */
  ttl: number;
};

/** Session transport — how the token rides on requests (cookie, header) */
export type SessionTransport = {
  /** Read token from the incoming request */
  get: () => string | undefined;
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
   * Creates a session for the given user. The token is also delivered via
   * the session transport; it is returned for header-based clients.
   */
  create: (args: {
    userId: string;
  }) => Promise<Result<{ token: string; userId: string }, never>>;
  get: () => Promise<{ userId: string } | null>;
  /** Ends the current session (signs the user out) */
  end: () => Promise<Result<object, never>>;
  /** Ends all sessions for the current user (signs out every device) */
  endAll: () => Promise<Result<object, never>>;
};

/* ────────────────────────────────────────────────────────────────────────
 * OTP — identity verification, optionally authentication.
 * ──────────────────────────────────────────────────────────────────────── */

/** OTP DB record */
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
  /** Upsert */
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
  /** OTP validity duration in ms */
  ttl: number;
};

/** Config for withOtp */
export type WithOtpConfig = {
  storage: OtpStorage;
  delivery: OtpDelivery;
};

export type VerifyOtpResult = Result<object, "invalid_otp">;

/** Otp methods — added as the `otp` namespace by withOtp */
export type OtpNamespace = {
  /**
   * Sends an otp to the identifier. Never reveals whether delivery
   * succeeded (enumeration safety).
   */
  request: (args: { identifier: string }) => Promise<Result<object, never>>;
  verify: (args: {
    identifier: string;
    otp: string;
  }) => Promise<VerifyOtpResult>;
};

/* ────────────────────────────────────────────────────────────────────────
 * Passkey — WebAuthn authentication.
 * ──────────────────────────────────────────────────────────────────────── */

/** Credential (passkey) stored data */
export type StoredCredential = {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransport[] | undefined;
};

/** Credential DB record */
export type CredentialRecord = {
  userId: string;
  credential: StoredCredential;
};

/** Credential (passkey) storage adapter */
export type CredentialStorage = {
  store: (record: CredentialRecord) => Promise<void>;
  get: (
    credentialId: string,
  ) => Promise<{ userId: string; credential: StoredCredential } | null>;
  /** All credentials belonging to the user */
  list: (userId: string) => Promise<StoredCredential[]>;
  /** Persist the WebAuthn signature counter after authentication (clone detection) */
  updateCounter: (credentialId: string, counter: number) => Promise<void>;
  delete: (credentialId: string) => Promise<void>;
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

/** Registration token payload */
export type RegistrationPayload = {
  userId: string;
  /** Null for identifier-less sign-up (passkey-only apps) */
  identifier: string | null;
};

/** Decoded registration token. Invalid or forged tokens decode to null. */
export type RegistrationDecoded = RegistrationPayload & {
  /** Token expiration */
  exp: Date;
  /** Token expired (exp < now) — expired tokens must be rejected */
  expired: boolean;
};

/** Registration codec (short-lived token authorizing passkey registration) */
export type RegistrationCodec = {
  encode: (payload: RegistrationPayload) => Promise<string>;
  decode: (token: string) => Promise<RegistrationDecoded | null>;
};

export type WebAuthnConfig = {
  rpId: string;
  rpName: string;
  /**
   * Exact allowed origins, scheme + host + port — e.g. ["https://app.example.com"].
   * Matched exactly against clientDataJSON.origin: no wildcards, no subdomain
   * logic, never inferred from rpId.
   */
  allowedOrigins: string[];
  /** Challenge validity duration in ms */
  challengeTtl: number;
};

/** Config for withPasskey */
export type WithPasskeyConfig = {
  storage: CredentialStorage;
  challenges: ChallengeStorage;
  registrationCodec: RegistrationCodec;
  webAuthn: WebAuthnConfig;
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

export type CreateRegistrationTokenResult = Result<
  { registrationToken: string },
  never
>;

export type ValidateRegistrationTokenResult = Result<
  { userId: string; identifier: string | null },
  "invalid_token"
>;

export type RegistrationOptionsResult = Result<
  { options: PublicKeyCredentialCreationOptionsJSON },
  "invalid_token"
>;

export type AuthenticationOptionsResult = Result<
  { options: PublicKeyCredentialRequestOptionsJSON },
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
  createRegistrationToken: (args: {
    userId: string;
    /** Shown in the passkey picker (user.name). Null for identifier-less sign-up (passkey-only apps). */
    identifier: string | null;
  }) => Promise<CreateRegistrationTokenResult>;
  validateRegistrationToken: (args: {
    token: string;
  }) => Promise<ValidateRegistrationTokenResult>;
  registrationOptions: (args: {
    registrationToken: string;
  }) => Promise<RegistrationOptionsResult>;
  /** Verifies and stores the credential. Does not create a session — call session.create. */
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationCredential;
  }) => Promise<VerifyRegistrationResult>;
  authenticationOptions: () => Promise<AuthenticationOptionsResult>;
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
