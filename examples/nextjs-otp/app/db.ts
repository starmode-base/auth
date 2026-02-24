/**
 * In-memory user store
 *
 * Simple in-memory user store for demonstration purposes. In a real app this
 * would be replaced with a database.
 */
const users = new Map<string, { userId: string; email: string }>();
let userIdCounter = 0;

/**
 * In-memory user store
 */
export const usersStore = {
  /**
   * Upsert user
   */
  upsert: (email: string) => {
    const exists = Array.from(users.values()).find((u) => u.email === email);

    if (exists) {
      return { userId: exists.userId, isNew: false };
    }

    const userId = `user_${++userIdCounter}`;

    users.set(userId, { userId, email });

    return { userId, isNew: true };
  },

  /**
   * Get user by ID
   */
  get: (userId: string) => users.get(userId),

  /**
   * Update user email
   */
  updateEmail: (userId: string, email: string) => {
    const user = users.get(userId);
    if (!user) return undefined;
    user.email = email;
    return user;
  },
};
