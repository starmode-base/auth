import { memoryCredentialStorage } from "@starmode/auth";

/**
 * In-memory database
 *
 * Simple in-memory stores for demonstration purposes. In a real app these
 * would be replaced with database queries.
 */

const users = new Map<string, { userId: string; email: string }>();
let userIdCounter = 0;

export const db = {
  users: {
    upsert: (email: string) => {
      const exists = Array.from(users.values()).find((u) => u.email === email);

      if (exists) {
        return { userId: exists.userId, isNew: false };
      }

      const userId = `user_${++userIdCounter}`;
      users.set(userId, { userId, email });

      return { userId, isNew: true };
    },

    get: (userId: string) => users.get(userId),

    findByEmail: (email: string) =>
      Array.from(users.values()).find((u) => u.email === email),
  },
  credentials: memoryCredentialStorage(),
};
