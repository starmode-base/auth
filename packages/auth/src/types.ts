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
    store: (identifier: string, otp: string, expiresAt: Date) => Promise<void>;
    verify: (identifier: string, otp: string) => Promise<boolean>;
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
export type RegistrationPayload = { userId: string; identifier: string };

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

/** OTP transport adapter for code delivery */
export type OtpTransportAdapter = {
  send: (identifier: string, otp: string) => Promise<void>;
};

/** Session transport adapter for token delivery */
export type SessionTransportAdapter = {
  /** Read token from incoming request */
  get: () => string | undefined;
  /** Store token and return what goes in response body */
  set: (token: string) => string;
  /** Clear stored token */
  clear: () => void;
};

/** Cookie options for session transport */
export type SessionCookieOptions = {
  cookieName: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
};

export type WebAuthnConfig = {
  rpId: string;
  rpName: string;
};

/** Error codes for auth failures */
export type AuthErrorCode =
  | "invalid_otp"
  | "invalid_token"
  | "challenge_expired"
  | "user_mismatch"
  | "credential_not_found"
  | "verification_failed";

/** Generic result type for failable operations */
export type Result<T = object> =
  | ({ success: true } & T)
  | { success: false; error: AuthErrorCode };

export type RequestOtpReturn = { success: true };
export type VerifyOtpReturn = Result;

export type CreateRegistrationTokenReturn = { registrationToken: string };

export type ValidateRegistrationTokenReturn = Result<{
  userId: string;
  identifier: string;
}>;

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

export type GenerateRegistrationOptionsReturn = Result<{
  options: PublicKeyCredentialCreationOptionsJSON;
}>;

export type VerifyRegistrationReturn = Result<{
  session: { token: string; userId: string };
}>;

export type GenerateAuthenticationOptionsReturn = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type VerifyAuthenticationReturn = Result<{
  session: { token: string; userId: string };
}>;

export type MakeAuthConfig = {
  storage: StorageAdapter;
  sessionCodec: SessionCodec;
  registrationCodec: RegistrationCodec;
  otpTransport: OtpTransportAdapter;
  webauthn: WebAuthnConfig;
  sessionTransport: SessionTransportAdapter;
  /** Enable debug logging for development */
  debug?: boolean;
};

/** All primitives returned by makeAuth */
export type MakeAuthReturn = {
  // OTP primitives
  requestOtp: (identifier: string) => Promise<RequestOtpReturn>;
  verifyOtp: (identifier: string, otp: string) => Promise<VerifyOtpReturn>;

  // Registration token primitives
  createRegistrationToken: (
    userId: string,
    identifier: string,
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
  getSession: () => Promise<{ userId: string } | null>;
  signOut: () => Promise<void>;
};

export type MakeAuth = (config: MakeAuthConfig) => MakeAuthReturn;

/**
 * Auth client interface — OTP + passkey primitives only.
 * Note: createRegistrationToken is server-side only (needs userId from DB)
 */
export type AuthClient = {
  // OTP
  requestOtp: (identifier: string) => Promise<RequestOtpReturn>;
  verifyOtp: (identifier: string, otp: string) => Promise<VerifyOtpReturn>;

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
