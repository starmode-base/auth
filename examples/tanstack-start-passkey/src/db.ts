/**
 * In-memory user store
 *
 * Simple in-memory user store for demonstration purposes. In a real app this
 * would be replaced with a database.
 */
const users = new Map<string, { userId: string }>();
let userIdCounter = 0;

/**
 * In-memory user store
 */
export const usersStore = {
  /**
   * Create a new user with auto-generated ID
   */
  create: () => {
    const userId = `user_${++userIdCounter}`;
    users.set(userId, { userId });
    return { userId };
  },

  /**
   * Get user by ID
   */
  get: (userId: string) => users.get(userId),
};
