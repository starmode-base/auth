import type {
  DeleteSessionAdapter,
  GetSessionAdapter,
  StoreOtpAdapter,
  StoreSessionAdapter,
  UpsertUserAdapter,
  VerifyOtpAdapter,
} from "../types";

type OtpRecord = { code: string; expiresAt: Date };
type SessionRecord = { userId: string; expiresAt: Date };
type UserRecord = { userId: string; email: string };

type MemoryAdapters = {
  storeOtp: StoreOtpAdapter;
  verifyOtp: VerifyOtpAdapter;
  upsertUser: UpsertUserAdapter;
  storeSession: StoreSessionAdapter;
  getSession: GetSessionAdapter;
  deleteSession: DeleteSessionAdapter;
  // Expose stores for testing
  _stores: {
    otps: Map<string, OtpRecord>;
    sessions: Map<string, SessionRecord>;
    users: Map<string, UserRecord>;
  };
};

export const makeMemoryAdapters = (): MemoryAdapters => {
  const otps = new Map<string, OtpRecord>();
  const sessions = new Map<string, SessionRecord>();
  const users = new Map<string, UserRecord>();

  let userIdCounter = 0;

  return {
    storeOtp: async (email, code, expiresAt) => {
      otps.set(email, { code, expiresAt });
    },

    verifyOtp: async (email, code) => {
      const record = otps.get(email);
      if (!record) return false;
      if (record.expiresAt < new Date()) {
        otps.delete(email);
        return false;
      }
      if (record.code !== code) return false;
      otps.delete(email);
      return true;
    },

    upsertUser: async (email) => {
      const existing = users.get(email);
      if (existing) {
        return { userId: existing.userId, isNew: false };
      }
      const userId = `user_${++userIdCounter}`;
      users.set(email, { userId, email });
      return { userId, isNew: true };
    },

    storeSession: async (sessionId, userId, expiresAt) => {
      sessions.set(sessionId, { userId, expiresAt });
    },

    getSession: async (sessionId) => {
      const record = sessions.get(sessionId);
      if (!record) return null;
      return { userId: record.userId, expiresAt: record.expiresAt };
    },

    deleteSession: async (sessionId) => {
      sessions.delete(sessionId);
    },

    _stores: { otps, sessions, users },
  };
};
