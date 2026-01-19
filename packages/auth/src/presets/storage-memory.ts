import type { StorageAdapter, StoredCredential } from "../types";

type OtpRecord = { otp: string; expiresAt: Date };
type SessionRecord = { userId: string; expiresAt: Date | null };
type CredentialRecord = { userId: string; credential: StoredCredential };

type MemoryStorageResult = StorageAdapter & {
  // Expose stores for testing
  _stores: {
    otps: Map<string, OtpRecord>;
    sessions: Map<string, SessionRecord>;
    credentials: Map<string, CredentialRecord>;
  };
};

export const storageMemory = (): MemoryStorageResult => {
  const otps = new Map<string, OtpRecord>();
  const sessions = new Map<string, SessionRecord>();
  const credentials = new Map<string, CredentialRecord>();

  return {
    otp: {
      store: async (identifier, otp, expiresAt) => {
        otps.set(identifier, { otp, expiresAt });
      },

      verify: async (identifier, otp) => {
        const record = otps.get(identifier);
        if (!record) return false;
        if (record.expiresAt < new Date()) {
          otps.delete(identifier);
          return false;
        }
        if (record.otp !== otp) return false;
        otps.delete(identifier); // One-time use
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
