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

/** Store session in database */
export type StoreSessionAdapter = (
  sessionId: string,
  userId: string,
  expiresAt: Date,
) => Promise<void>;

/** Get session from database */
export type GetSessionAdapter = (
  sessionId: string,
) => Promise<{ userId: string; expiresAt: Date } | null>;

/** Delete session from database */
export type DeleteSessionAdapter = (sessionId: string) => Promise<void>;

// ============================================================================
// Token adapter
// ============================================================================

/** Encode/decode session tokens (JWT or opaque) */
export type SessionTokenAdapter = {
  encode: (payload: { sessionId: string; userId: string }) => string;
  decode: (token: string) => {
    sessionId: string;
    userId: string;
    valid: boolean;
    expired: boolean;
  } | null;
};

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

export type CreateAuthConfig = {
  // OTP persistence
  storeOtp: StoreOtpAdapter;
  verifyOtp: VerifyOtpAdapter;

  // User persistence
  upsertUser: UpsertUserAdapter;

  // Session persistence
  storeSession: StoreSessionAdapter;
  getSession: GetSessionAdapter;
  deleteSession: DeleteSessionAdapter;

  // Session token format
  sessionToken: SessionTokenAdapter;

  // OTP delivery
  email: OtpEmailAdapter;
  send: OtpSendAdapter;
};

export type CreateAuthReturn = {
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (
    email: string,
    code: string,
  ) => Promise<{ valid: boolean; userId?: string; token?: string }>;
  getSession: (token: string) => Promise<{ userId: string } | null>;
  deleteSession: (token: string) => Promise<void>;
};

export type CreateAuth = (config: CreateAuthConfig) => CreateAuthReturn;
