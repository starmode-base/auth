// ============================================================================
// Persistence adapters
// ============================================================================

/** Store OTP code for email verification */
export type StoreOtpAdapter = (
  email: string,
  code: string,
  expiresAt: Date,
) => Promise<void>;

/** Verify OTP code, return true if valid and not expired */
export type VerifyOtpAdapter = (
  email: string,
  code: string,
) => Promise<boolean>;

/** Upsert user by email (atomic — no race conditions) */
export type UpsertUserAdapter = (
  email: string,
) => Promise<{ userId: string; isNew: boolean }>;

/** Store session */
export type StoreSessionAdapter = (
  sessionId: string,
  userId: string,
  expiresAt: Date,
) => Promise<void>;

/** Get session */
export type GetSessionAdapter = (
  sessionId: string,
) => Promise<{ userId: string; expiresAt: Date } | null>;

/** Delete session */
export type DeleteSessionAdapter = (sessionId: string) => Promise<void>;

/** Encode session data into a token string */
export type EncodeSessionTokenAdapter = (payload: {
  sessionId: string;
  userId: string;
}) => string;

/** Decode token string back to session data */
export type DecodeSessionTokenAdapter = (token: string) => {
  sessionId: string;
  userId: string;
  valid: boolean;
  expired: boolean;
} | null;

// ============================================================================
// OTP delivery adapters
// ============================================================================

/** Format OTP email content */
export type OtpEmailAdapter = (code: string) => {
  subject: string;
  body: string;
};

/** Send OTP email */
export type OtpSendAdapter = (
  email: string,
  content: { subject: string; body: string },
) => Promise<void>;

// ============================================================================
// Config & Return types
// ============================================================================

export type MakeAuthConfig = {
  // OTP persistence
  storeOtp: StoreOtpAdapter;
  verifyOtp: VerifyOtpAdapter;

  // User persistence
  upsertUser: UpsertUserAdapter;

  // Session (stored data)
  storeSession: StoreSessionAdapter;
  getSession: GetSessionAdapter;
  deleteSession: DeleteSessionAdapter;

  // Session token (string representation)
  encodeSessionToken: EncodeSessionTokenAdapter;
  decodeSessionToken: DecodeSessionTokenAdapter;

  // OTP delivery
  email: OtpEmailAdapter;
  send: OtpSendAdapter;
};

export type MakeAuthReturn = {
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (
    email: string,
    code: string,
  ) => Promise<{ valid: boolean; userId?: string; token?: string }>;
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
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (
    email: string,
    code: string,
  ) => Promise<{ valid: boolean; userId?: string }>;
  getSession: () => Promise<{ userId: string } | null>;
  signOut: () => Promise<void>;
};

export type MakeCookieAuth = (config: MakeCookieAuthConfig) => CookieAuthReturn;

// ============================================================================
// Client types
// ============================================================================

/** Auth client interface — subset of CookieAuthReturn for client use */
export type AuthClient = {
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (
    email: string,
    code: string,
  ) => Promise<{ valid: boolean; userId?: string }>;
  signOut: () => Promise<void>;
};
