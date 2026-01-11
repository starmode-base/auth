// ============================================================================
// Storage adapters
// ============================================================================

/** Credential (passkey) stored data */
export type StoredCredential = {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransport[];
};

/**
 * Storage adapter (persistence)
 *
 * Implements storage for OTPs, sessions, and passkey credentials.
 * You can implement this as a single class or object wrapping your database.
 */
export type StorageAdapter = {
  otp: {
    store: (email: string, otp: string, expiresAt: Date) => Promise<void>;
    verify: (email: string, otp: string) => Promise<boolean>;
  };
  session: {
    store: (
      sessionId: string,
      userId: string,
      expiresAt: Date,
    ) => Promise<void>;
    get: (
      sessionId: string,
    ) => Promise<{ userId: string; expiresAt: Date } | null>;
    delete: (sessionId: string) => Promise<void>;
  };
  credential: {
    store: (userId: string, credential: StoredCredential) => Promise<void>;
    get: (userId: string) => Promise<StoredCredential[]>;
    getById: (
      credentialId: string,
    ) => Promise<{ userId: string; credential: StoredCredential } | null>;
    updateCounter: (credentialId: string, counter: number) => Promise<void>;
  };
};

// ============================================================================
// Codecs (token encode/decode)
// ============================================================================

/** Session payload */
export type SessionPayload = { sessionId: string; userId: string };

/** Decoded session result */
export type SessionDecoded = SessionPayload & {
  valid: boolean;
  expired: boolean;
};

/** Session codec (encode/decode HMAC, opaque, or JWT) */
export type SessionCodec = {
  encode: (payload: SessionPayload) => Promise<string>;
  decode: (token: string) => Promise<SessionDecoded | null>;
};

/** Registration payload */
export type RegistrationPayload = { userId: string; email: string };

/** Decoded registration result */
export type RegistrationDecoded = RegistrationPayload & {
  valid: boolean;
  expired: boolean;
};

/** Registration codec (short-lived token for passkey registration) */
export type RegistrationCodec = {
  encode: (payload: RegistrationPayload) => Promise<string>;
  decode: (token: string) => Promise<RegistrationDecoded | null>;
};

// ============================================================================
// OTP delivery adapters
// ============================================================================

/** Send OTP */
export type OtpSender = (email: string, otp: string) => Promise<void>;

// ============================================================================
// Passkey config
// ============================================================================

export type WebAuthnConfig = {
  rpId: string;
  rpName: string;
  // Optional: origin override for verification (defaults to https://{rpId})
  origin?: string;
};

// ============================================================================
// Return types
// ============================================================================

export type RequestOtpReturn = { success: boolean };

export type VerifyOtpReturn = { valid: boolean };

export type CreateRegistrationTokenReturn = { registrationToken: string };

export type ValidateRegistrationTokenReturn = {
  userId: string;
  email: string;
  valid: boolean;
};

// WebAuthn types (JSON for transport)
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
    transports?: AuthenticatorTransport[];
  };
  authenticatorAttachment?: AuthenticatorAttachment;
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
    userHandle?: string;
  };
  authenticatorAttachment?: AuthenticatorAttachment;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
};

export type GenerateRegistrationOptionsReturn = {
  options: PublicKeyCredentialCreationOptionsJSON;
};

/** Error codes for passkey verification failures */
export type AuthErrorCode =
  | "invalid_token"
  | "challenge_expired"
  | "user_mismatch"
  | "credential_not_found"
  | "verification_failed";

export type VerifyRegistrationReturn =
  | { success: true; session: { token: string; userId: string } }
  | { success: false; error: AuthErrorCode };

export type GenerateAuthenticationOptionsReturn = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type VerifyAuthenticationReturn =
  | { valid: true; session: { token: string; userId: string } }
  | { valid: false; error: AuthErrorCode };

// ============================================================================
// Config & main return type
// ============================================================================

export type MakeAuthConfig = {
  storage: StorageAdapter;
  session: SessionCodec;
  registration: RegistrationCodec;
  sendOtp: OtpSender;
  webauthn: WebAuthnConfig;
};

/** All primitives returned by makeAuth */
export type MakeAuthReturn = {
  // OTP primitives
  requestOtp: (email: string) => Promise<RequestOtpReturn>;
  verifyOtp: (email: string, otp: string) => Promise<VerifyOtpReturn>;

  // Registration token primitives
  createRegistrationToken: (
    userId: string,
    email: string,
  ) => Promise<CreateRegistrationTokenReturn>;
  validateRegistrationToken: (
    token: string,
  ) => Promise<ValidateRegistrationTokenReturn>;

  // Passkey primitives
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  // Session primitives
  getSession: (token: string) => Promise<{ userId: string } | null>;
  deleteSession: (token: string) => Promise<void>;
};

export type MakeAuth = (config: MakeAuthConfig) => MakeAuthReturn;

// ============================================================================
// Cookie auth types
// ============================================================================

/** Cookie adapter — you provide these (framework-specific) */
export type CookieAdapter = {
  get: () => string | undefined;
  set: (token: string) => void;
  clear: () => void;
};

/** Cookie auth config */
export type MakeCookieAuthConfig = {
  auth: MakeAuthReturn;
  cookie: CookieAdapter;
};

/** Cookie auth — wraps auth with automatic cookie handling */
export type CookieAuthReturn = {
  // OTP
  requestOtp: (email: string) => Promise<RequestOtpReturn>;
  verifyOtp: (email: string, otp: string) => Promise<VerifyOtpReturn>;

  // Registration token (server-side only — use in composed flows like signUp)
  createRegistrationToken: (
    userId: string,
    email: string,
  ) => Promise<CreateRegistrationTokenReturn>;

  // Passkey (sets session cookie automatically)
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  // Session
  getSession: () => Promise<{ userId: string } | null>;
  signOut: () => Promise<void>;
};

export type MakeCookieAuth = (config: MakeCookieAuthConfig) => CookieAuthReturn;

// ============================================================================
// Client types
// ============================================================================

/**
 * Auth client interface — OTP + passkey primitives only.
 * Note: createRegistrationToken is server-side only (needs userId from DB)
 */
export type AuthClient = {
  // OTP
  requestOtp: (email: string) => Promise<RequestOtpReturn>;
  verifyOtp: (email: string, otp: string) => Promise<VerifyOtpReturn>;

  // Passkey (registrationToken comes from server-side signUp flow)
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  signOut: () => Promise<void>;
};
