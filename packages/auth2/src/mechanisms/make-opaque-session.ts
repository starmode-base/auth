import type { SessionAdapter, SessionIdentity } from "../contracts";
import { randomBase64url } from "../lib/crypto";

/** Session record — the shape exchanged with session storage, not a stored schema */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  expiresAt: Date;
};

/**
 * Session storage adapter. Plain reads and writes keyed by sessionId; the
 * mechanism enforces expiry.
 */
export type SessionStorage = {
  store: (record: SessionRecord) => Promise<void>;
  get: (sessionId: string) => Promise<SessionRecord | null>;
  delete: (sessionId: string) => Promise<void>;
};

/** Credential issued when an opaque session is established */
export type OpaqueSessionCredential = {
  token: string;
  expiresAt: Date;
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
