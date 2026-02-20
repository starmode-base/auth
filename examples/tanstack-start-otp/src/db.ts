/**
 * In-memory user store
 *
 * Simple in-memory user store for demonstration purposes. In a real app this
 * would be replaced with a database.
 */
const users = new Map<string, { userId: string; email: string }>();
let userIdCounter = 0;

export const usersStore = {
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
};
