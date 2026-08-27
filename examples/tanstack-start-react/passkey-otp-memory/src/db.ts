/**
 * In-memory database
 *
 * Simple in-memory stores for demonstration purposes. In a real app these
 * would be replaced with database queries.
 */
import type {
  ChallengeRecord,
  CredentialRecord,
  OtpRecord,
  SessionRecord,
} from "@starmode/auth2";

const users = new Map<string, { userId: string; email?: string }>();
let userIdCounter = 0;

const sessions = new Map<string, SessionRecord>();
const otps = new Map<string, OtpRecord>();
const credentials = new Map<string, CredentialRecord>();
const challenges = new Map<string, ChallengeRecord>();

export const db = {
  users: {
    create: () => {
      const userId = `user_${++userIdCounter}`;
      users.set(userId, { userId });
      return { userId };
    },

    get: (userId: string) => users.get(userId),

    setEmail: (userId: string, email: string) => {
      const user = users.get(userId);
      if (!user) return undefined;
      user.email = email;
      return user;
    },
  },

  sessions: {
    store: async (record: SessionRecord) => {
      sessions.set(record.sessionId, record);
    },

    get: async (sessionId: string) => sessions.get(sessionId) ?? null,

    delete: async (sessionId: string) => {
      sessions.delete(sessionId);
    },

    deleteAllForUser: (userId: string) => {
      for (const [sessionId, record] of sessions) {
        if (record.userId === userId) {
          sessions.delete(sessionId);
        }
      }
    },
  },

  otps: {
    store: async (record: OtpRecord) => {
      otps.set(record.identifier, record);
    },

    take: async (identifier: string) => {
      const record = otps.get(identifier) ?? null;
      otps.delete(identifier);
      return record;
    },
  },

  credentials: {
    store: async (record: CredentialRecord) => {
      credentials.set(record.credentialId, record);
    },

    get: async (credentialId: string) => credentials.get(credentialId) ?? null,

    list: async (userId: string) =>
      Array.from(credentials.values()).filter((c) => c.userId === userId),

    setCounter: async (credentialId: string, counter: number) => {
      const record = credentials.get(credentialId);
      if (record) credentials.set(credentialId, { ...record, counter });
    },

    delete: (credentialId: string) => {
      credentials.delete(credentialId);
    },
  },

  challenges: {
    store: async (record: ChallengeRecord) => {
      challenges.set(record.challenge, record);
    },

    take: async (challenge: string) => {
      const record = challenges.get(challenge) ?? null;
      challenges.delete(challenge);
      return record;
    },
  },
};
