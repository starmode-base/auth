import type { StorageAdapter, StoredCredential } from "../types";

type OtpRecord = { code: string; expiresAt: Date };
type SessionRecord = { userId: string; expiresAt: Date };
type CredentialRecord = { userId: string; credential: StoredCredential };

type MemoryAdaptersReturn = StorageAdapter & {
  // Expose stores for testing
  _stores: {
    otps: Map<string, OtpRecord>;
    sessions: Map<string, SessionRecord>;
    credentials: Map<string, CredentialRecord>;
  };
};

export const makeMemoryAdapters = (): MemoryAdaptersReturn => {
  const otps = new Map<string, OtpRecord>();
  const sessions = new Map<string, SessionRecord>();
  const credentials = new Map<string, CredentialRecord>();

  return {
    otp: {
      store: async (email, code, expiresAt) => {
        otps.set(email, { code, expiresAt });
      },

      verify: async (email, code) => {
        const record = otps.get(email);
        if (!record) return false;
        if (record.expiresAt < new Date()) {
          otps.delete(email);
          return false;
        }
        if (record.code !== code) return false;
        otps.delete(email); // One-time use
        return true;
      },
    },

    session: {
      store: async (sessionId, userId, expiresAt) => {
        sessions.set(sessionId, { userId, expiresAt });
      },

      get: async (sessionId) => {
        const record = sessions.get(sessionId);
        if (!record) return null;
        return { userId: record.userId, expiresAt: record.expiresAt };
      },

      delete: async (sessionId) => {
        sessions.delete(sessionId);
      },
    },

    credential: {
      store: async (userId, cred) => {
        credentials.set(cred.id, { userId, credential: cred });
      },

      get: async (userId) => {
        const result: StoredCredential[] = [];
        for (const record of credentials.values()) {
          if (record.userId === userId) {
            result.push(record.credential);
          }
        }
        return result;
      },

      getById: async (credentialId) => {
        const record = credentials.get(credentialId);
        if (!record) return null;
        return { userId: record.userId, credential: record.credential };
      },

      updateCounter: async (credentialId, counter) => {
        const record = credentials.get(credentialId);
        if (record) {
          record.credential.counter = counter;
        }
      },
    },

    _stores: { otps, sessions, credentials },
  };
};
