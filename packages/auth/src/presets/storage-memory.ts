import type {
  CredentialRecord,
  OtpRecord,
  OtpStorage,
  SessionRecord,
  SessionStorage,
  CredentialStorage,
  StoredCredential,
} from "../types";

export type MemoryOtpStorage = OtpStorage & {
  _store: Map<string, OtpRecord>;
};

export type MemorySessionStorage = SessionStorage & {
  _store: Map<string, SessionRecord>;
};

export type MemoryCredentialStorage = CredentialStorage & {
  _store: Map<string, CredentialRecord>;
};

export const memoryOtpStorage = (): MemoryOtpStorage => {
  const store = new Map<string, OtpRecord>();

  return {
    store: async ({ identifier, otp, expiresAt }) => {
      store.set(identifier, { identifier, otp, expiresAt });
    },

    verify: async (identifier, otp) => {
      const record = store.get(identifier);
      if (!record) return false;
      if (record.expiresAt < new Date()) {
        store.delete(identifier);
        return false;
      }
      if (record.otp !== otp) return false;
      store.delete(identifier); // One-time use
      return true;
    },

    _store: store,
  };
};

export const memorySessionStorage = (): MemorySessionStorage => {
  const store = new Map<string, SessionRecord>();

  return {
    store: async ({ sessionId, userId, expiresAt }) => {
      store.set(sessionId, { sessionId, userId, expiresAt });
    },

    get: async (sessionId) => {
      const record = store.get(sessionId);
      if (!record) return null;

      return {
        sessionId,
        userId: record.userId,
        expiresAt: record.expiresAt,
      };
    },

    delete: async (sessionId) => {
      store.delete(sessionId);
    },

    deleteAll: async (sessionId) => {
      const target = store.get(sessionId);
      if (!target) return;

      for (const [id, record] of store) {
        if (record.userId === target.userId) {
          store.delete(id);
        }
      }
    },

    _store: store,
  };
};

export const memoryCredentialStorage = (): MemoryCredentialStorage => {
  const store = new Map<string, CredentialRecord>();

  return {
    store: async ({ userId, credential }) => {
      store.set(credential.id, { userId, credential });
    },

    get: async (userId) => {
      const result: StoredCredential[] = [];
      for (const record of store.values()) {
        if (record.userId === userId) {
          result.push(record.credential);
        }
      }
      return result;
    },

    getById: async (credentialId) => {
      const record = store.get(credentialId);
      if (!record) return null;
      return { userId: record.userId, credential: record.credential };
    },

    updateCounter: async (credentialId, counter) => {
      const record = store.get(credentialId);
      if (record) {
        record.credential.counter = counter;
      }
    },

    delete: async (credentialId) => {
      store.delete(credentialId);
    },

    _store: store,
  };
};
