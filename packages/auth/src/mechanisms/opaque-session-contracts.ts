/** Session record — the shape exchanged with session storage, not a stored schema */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  /** Expired only when expiresAt < now. Equality remains valid. */
  expiresAt: Date;
};

/** Read half of session storage, sufficient for resolution */
export type SessionReadStorage = {
  get: (sessionId: string) => Promise<SessionRecord | null>;
};

/**
 * Session storage adapter. Plain reads and writes keyed by sessionId; the
 * mechanism enforces expiry.
 */
export type SessionStorage = SessionReadStorage & {
  store: (record: SessionRecord) => Promise<void>;
  delete: (sessionId: string) => Promise<void>;
};

/** Credential issued when an opaque session is established */
export type OpaqueSessionCredential = {
  token: string;
  expiresAt: Date;
};

export type MakeOpaqueSessionResolverConfig = {
  storage: SessionReadStorage;
};

export type MakeOpaqueSessionConfig = {
  storage: SessionStorage;
  /** Absolute session lifetime in ms */
  ttl: number;
};

/** Session capabilities of the opaque session mechanism */
export type OpaqueSessionCapabilities = {
  end: (token: string | null) => Promise<void>;
};
