/**
 * ΛUTH contracts — the typed API spec.
 *
 * Self-sufficient: imports nothing from the legacy tree, so it can be edited
 * freely. This file is the source of intent while the API is finalized; the
 * README is rewritten from it at promotion. It contains contracts only —
 * everything user code touches: adapter interfaces, config shapes, method
 * namespaces, the four auth shapes, factory signatures. Mechanisms, bindings,
 * and config bundles are implementations of these contracts and live outside.
 *
 * Layout previews the promoted file split: each banner section becomes a file.
 *
 * Verified by make-auth-typecheck.ts (compile-time assertions, both
 * directions) and exercised by playground.ts.
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
  | "invalid_request"
  | "internal_error";

/** Generic result type for failable operations — expected failures are values, never exceptions */
export type Result<T = object> =
  ({ success: true } & T) | { success: false; error: AuthErrorCode };

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

/** Decoded session token. Returned only when authentic; forged/garbled tokens decode to null. */
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

/** Config for makeAuth — the session core (session is not a sub-object; it IS the core) */
export type MakeAuthConfig = {
  storage: SessionStorage;
  codec: SessionCodec;
  transport: SessionTransport;
  /** Session TTL in ms (Infinity = forever). Inactivity timeout with sliding refresh. */
  ttl: number;
  debug: boolean;
};

export type CreateSessionResult = Result<{
  session: { token: string; userId: string };
}>;

/** Session methods — the core namespace, present at every step */
export type SessionNamespace = {
  create: (args: { userId: string }) => Promise<CreateSessionResult>;
  get: () => Promise<{ userId: string } | null>;
  /** End the current session (signs the user out) */
  end: () => Promise<void>;
  /** End all sessions for the current user (signs out every device) */
  endAll: () => Promise<void>;
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
 * OTP storage adapter — the semantic contract.
 *
 * verify states meaning, not mechanism: implementations must guarantee
 * expiry, comparison, and one-time use — or be produced by makeOtpStorage,
 * which builds those guarantees from two dumb atomic primitives. Delegated
 * verification (e.g. a provider that checks the otp remotely) implements
 * this contract directly.
 */
export type OtpStorage = {
  store: (record: OtpRecord) => Promise<void>;
  /** One attempt per otp: a wrong guess consumes it */
  verify: (identifier: string, otp: string) => Promise<boolean>;
};

/**
 * Input contract for makeOtpStorage — two dumb primitives, one guarantee.
 * take must be an atomic fetch-and-delete (DELETE … RETURNING, GETDEL).
 * The lazy implementation fails closed: returning null denies access.
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

export type RequestOtpResult = { success: true };
export type VerifyOtpResult = Result;

/** Otp methods — added as the `otp` namespace by withOtp */
export type OtpNamespace = {
  request: (args: { identifier: string }) => Promise<RequestOtpResult>;
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
  get: (userId: string) => Promise<StoredCredential[]>;
  getById: (
    credentialId: string,
  ) => Promise<{ userId: string; credential: StoredCredential } | null>;
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

/** Challenge storage adapter — challenges are single-use, so take-shaped */
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

/** Decoded registration token. Returned only when authentic; forged tokens decode to null. */
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

/* Results — pure verification, no session piping. Verification returns the
 * userId; apps create sessions explicitly via session.create, exactly like
 * the otp flow. Symmetry unlocks composition: multi-factor, step-up checks,
 * and custom flows need no library support. */

export type CreateRegistrationTokenResult = { registrationToken: string };

export type ValidateRegistrationTokenResult = Result<{
  userId: string;
  identifier: string | null;
}>;

export type RegistrationOptionsResult = Result<{
  options: PublicKeyCredentialCreationOptionsJSON;
}>;

export type AuthenticationOptionsResult = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type VerifyRegistrationResult = Result<{ userId: string }>;

export type VerifyAuthenticationResult = Result<{ userId: string }>;

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
  /** Verifies and stores the credential. Does NOT create a session. */
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationCredential;
  }) => Promise<VerifyRegistrationResult>;
  authenticationOptions: () => Promise<AuthenticationOptionsResult>;
  /** Verifies the assertion against the stored credential. Does NOT create a session. */
  verifyAuthentication: (args: {
    credential: AuthenticationCredential;
  }) => Promise<VerifyAuthenticationResult>;
};

/* ────────────────────────────────────────────────────────────────────────
 * Composition — the builder. Every config unit yields one namespace.
 * Four concrete shapes, no generics; misconfiguration does not compile.
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
