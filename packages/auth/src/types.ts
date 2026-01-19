/** Credential (passkey) stored data */
export type StoredCredential = {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransport[];
};

/** OTP DB record */
export type OtpRecord = {
  identifier: string;
  otp: string;
  expiresAt: Date;
};

/** Session DB record */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  expiresAt: Date | null;
};

/** Credential DB record */
export type CredentialRecord = {
  userId: string;
  credential: StoredCredential;
};

/**
 * Storage adapter (persistence)
 *
 * Implements storage for OTPs, sessions, and passkey credentials.
 * You can implement this as a single class or object wrapping your database.
 */
export type StorageAdapter = {
  otp: {
    store: (record: OtpRecord) => Promise<void>;
    verify: (identifier: string, otp: string) => Promise<boolean>;
  };
  session: {
    store: (record: SessionRecord) => Promise<void>;
    get: (sessionId: string) => Promise<SessionRecord | null>;
    delete: (sessionId: string) => Promise<void>;
  };
  credential: {
    store: (record: CredentialRecord) => Promise<void>;
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
  /** OTP validity duration in milliseconds */
  ttl: number;
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
  /** Challenge validity duration in milliseconds */
  challengeTtl: number;
};

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

/** Generic result type for failable operations */
export type Result<T = object> =
  | ({ success: true } & T)
  | { success: false; error: AuthErrorCode };

export type RequestOtpResult = { success: true };
export type VerifyOtpResult = Result;

export type CreateRegistrationTokenResult = { registrationToken: string };

export type ValidateRegistrationTokenResult = Result<{
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

export type GenerateRegistrationOptionsResult = Result<{
  options: PublicKeyCredentialCreationOptionsJSON;
}>;

export type VerifyRegistrationResult = Result<{
  session: { token: string; userId: string };
}>;

export type GenerateAuthenticationOptionsResult = {
  options: PublicKeyCredentialRequestOptionsJSON;
};

export type VerifyAuthenticationResult = Result<{
  session: { token: string; userId: string };
}>;

export type MakeAuthConfig = {
  storage: StorageAdapter;
  sessionCodec: SessionCodec;
  registrationCodec: RegistrationCodec;
  otpTransport: OtpTransportAdapter;
  sessionTransport: SessionTransportAdapter;
  webAuthn: WebAuthnConfig;
  /** Session TTL: number (ms) for inactivity timeout with sliding refresh, false for forever */
  sessionTtl: number | false;
  /** Enable debug logging for development */
  debug?: boolean;
};

/** All primitives returned by makeAuth */
export type MakeAuthResult = {
  /**
   * Send OTP to identifier (email or phone)
   *
   * The OTP is valid for a short window and must be verified before the user
   * can proceed.
   */
  requestOtp: (args: { identifier: string }) => Promise<RequestOtpResult>;

  /**
   * Verify the OTP matches what was sent to the identifier
   *
   * Returns success if valid, allowing the client to proceed with sign-up or
   * sign-in.
   */
  verifyOtp: (args: {
    identifier: string;
    otp: string;
  }) => Promise<VerifyOtpResult>;

  /**
   * Create a short-lived registration token
   *
   * Authorizes the client to register a passkey for this user without needing
   * to re-verify identifier ownership.
   */
  createRegistrationToken: (args: {
    userId: string;
    identifier: string;
  }) => Promise<CreateRegistrationTokenResult>;

  /**
   * Validate a registration token
   *
   * Returns the userId and identifier encoded in the token if valid.
   */
  validateRegistrationToken: (args: {
    token: string;
  }) => Promise<ValidateRegistrationTokenResult>;

  /**
   * Generate WebAuthn registration options for the browser
   *
   * The registration token ties this request to a verified user without
   * exposing the user ID to the client.
   */
  generateRegistrationOptions: (args: {
    registrationToken: string;
  }) => Promise<GenerateRegistrationOptionsResult>;

  /**
   * Verify passkey registration and store the credential
   *
   * Validates the credential response from the browser and stores the new
   * passkey. On success, creates a session so the user is immediately signed
   * in.
   */
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationCredential;
  }) => Promise<VerifyRegistrationResult>;

  /**
   * Generate WebAuthn authentication options for the browser
   *
   * The challenge is stored server-side and verified when the credential
   * response comes back.
   */
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsResult>;

  /**
   * Verify passkey authentication
   *
   * Validates the credential assertion from the browser against a stored
   * passkey. On success, creates a session to establish the authenticated
   * session.
   */
  verifyAuthentication: (args: {
    credential: AuthenticationCredential;
  }) => Promise<VerifyAuthenticationResult>;

  /**
   * Get the current session
   *
   * Returns the session if the user is authenticated, or null otherwise.
   * Used to check auth state on page load and during navigation.
   */
  getSession: () => Promise<{ userId: string } | null>;

  /**
   * Sign out and end the current session
   *
   * Invalidates the current session and clears the session cookie.
   */
  signOut: () => Promise<void>;
};

export type MakeAuth = (config: MakeAuthConfig) => MakeAuthResult;

/**
 * Auth client interface — HTTP mutations + browser WebAuthn helpers.
 *
 * Note: createRegistrationToken and getSession are server-side only.
 */
export type AuthClient = {
  /**
   * Send OTP to identifier (email or phone)
   *
   * The OTP is valid for a short window and must be verified before the user
   * can proceed.
   */
  requestOtp: (args: { identifier: string }) => Promise<RequestOtpResult>;

  /**
   * Verify the OTP matches what was sent to the identifier
   *
   * Returns success if valid, allowing the client to proceed with sign-up or
   * sign-in.
   */
  verifyOtp: (args: {
    identifier: string;
    otp: string;
  }) => Promise<VerifyOtpResult>;

  /**
   * Generate WebAuthn registration options for the browser
   *
   * The registration token ties this request to a verified user without
   * exposing the user ID to the client.
   */
  generateRegistrationOptions: (args: {
    registrationToken: string;
  }) => Promise<GenerateRegistrationOptionsResult>;

  /**
   * Verify passkey registration and store the credential
   *
   * Validates the credential response from the browser and stores the new
   * passkey. On success, creates a session so the user is immediately signed
   * in.
   */
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationCredential;
  }) => Promise<VerifyRegistrationResult>;

  /**
   * Generate WebAuthn authentication options for the browser
   *
   * The challenge is stored server-side and verified when the credential
   * response comes back.
   */
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsResult>;

  /**
   * Verify passkey authentication
   *
   * Validates the credential assertion from the browser against a stored
   * passkey. On success, creates a session to establish the authenticated
   * session.
   */
  verifyAuthentication: (args: {
    credential: AuthenticationCredential;
  }) => Promise<VerifyAuthenticationResult>;

  /**
   * Sign out and end the current session
   *
   * Invalidates the current session and clears the session cookie.
   */
  signOut: () => Promise<void>;

  /**
   * Create a passkey (WebAuthn registration ceremony)
   *
   * Triggers the browser's native credential creation dialog. Returns the
   * credential for server verification, or null if the user cancels.
   */
  createPasskey: (
    options: PublicKeyCredentialCreationOptionsJSON,
  ) => Promise<RegistrationCredential | null>;

  /**
   * Sign in with a passkey (WebAuthn authentication ceremony)
   *
   * Triggers the browser's native credential selection dialog. Returns the
   * credential for server verification, or null if the user cancels.
   */
  getPasskey: (
    options: PublicKeyCredentialRequestOptionsJSON,
  ) => Promise<AuthenticationCredential | null>;
};
