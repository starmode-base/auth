import { memoryCredentialStorage } from "@starmode/auth";

/**
 * In-memory database
 *
 * Simple in-memory stores for demonstration purposes. In a real app these
 * would be replaced with database queries.
 */

const users = new Map<string, { userId: string; email?: string }>();
let userIdCounter = 0;

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
  credentials: memoryCredentialStorage(),
};
