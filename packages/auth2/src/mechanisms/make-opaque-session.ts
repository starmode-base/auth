import type {
  SessionAdapter,
  SessionIdentity,
  SessionResolver,
} from "../contracts";
import { randomBase64url } from "../lib/crypto";

/** Session record — the shape exchanged with session storage, not a stored schema */
export type SessionRecord = {
  sessionId: string;
  userId: string;
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

export type MakeOpaqueSessionReaderConfig = {
  storage: SessionReadStorage;
};

/**
 * Read-only resolution over the same storage and expiry rules, for execution
 * contexts that cannot construct a write-capable adapter.
 */
export function makeOpaqueSessionReader(
  config: MakeOpaqueSessionReaderConfig,
): SessionResolver<SessionIdentity> {
  return {
    resolve: async (token) => {
      if (token === null) {
        return null;
      }

      const record = await config.storage.get(token);

      if (record === null || record.expiresAt < new Date()) {
        return null;
      }

      return { userId: record.userId };
    },
  };
}

export type MakeOpaqueSessionConfig = {
  storage: SessionStorage;
  /** Absolute session lifetime in ms */
  ttl: number;
};

/** Session capabilities of the opaque session mechanism */
export type OpaqueSessionCapabilities = {
  end: (token: string | null) => Promise<void>;
};

/**
 * Builds a database-backed session whose credential is an unguessable
 * reference to the stored record.
 */
export function makeOpaqueSession(
  config: MakeOpaqueSessionConfig,
): SessionAdapter<
  SessionIdentity,
  OpaqueSessionCredential,
  OpaqueSessionCapabilities
> {
  return {
    kernel: {
      establish: async (userId) => {
        const token = randomBase64url(32);
        const expiresAt = new Date(Date.now() + config.ttl);

        await config.storage.store({ sessionId: token, userId, expiresAt });

        return { token, expiresAt };
      },
      resolve: makeOpaqueSessionReader({ storage: config.storage }).resolve,
    },
    capabilities: {
      end: async (token) => {
        if (token !== null) {
          await config.storage.delete(token);
        }
      },
    },
  };
}
