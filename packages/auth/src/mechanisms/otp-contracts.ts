/** OTP record — the shape exchanged with OTP storage, not a stored schema */
export type OtpRecord = {
  /** Identifier (email address, phone number, etc.) */
  identifier: string;
  otp: string;
  /** Expired only when expiresAt < now. Equality remains valid. */
  expiresAt: Date;
  /** Verification attempts left before the OTP is consumed */
  attempts: number;
};

/**
 * OTP storage adapter. store upserts by identifier. take is an atomic
 * fetch-and-delete; an unknown identifier returns null.
 */
export type OtpStorage = {
  store: (record: OtpRecord) => Promise<void>;
  take: (identifier: string) => Promise<OtpRecord | null>;
};

/** OTP delivery adapter (email, SMS, console) */
export type OtpDelivery = {
  send: (identifier: string, otp: string) => Promise<void>;
};

export type MakeOtpConfig = {
  storage: OtpStorage;
  delivery: OtpDelivery;
  /** OTP validity duration in ms */
  ttl: number;
  /** Verification attempts per OTP; a wrong attempt beyond the last consumes it */
  attempts: number;
};

/** OTP proof primitive, usable with or without session establishment */
export type Otp = {
  /** Generates, stores, and delivers a fresh OTP for the identifier */
  request: (identifier: string) => Promise<void>;
  /** A wrong attempt spends one of the OTP's attempts; the last one consumes it */
  verify: (identifier: string, otp: string) => Promise<boolean>;
};
