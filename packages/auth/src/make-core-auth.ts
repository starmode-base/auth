import type {
  BaseAuthConfig,
  AuthErrorCode,
  CreateSessionResult,
  CoreMethods,
} from "./types";

/** Generate a random session ID */
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Result helpers with optional debug logging */
export type ResultHelpers = {
  ok: <T extends object>(data: T) => { success: true } & T;
  fail: (
    error: AuthErrorCode,
    err?: unknown,
  ) => { success: false; error: AuthErrorCode };
};

/** Session creation function shared with passkey methods */
export type StoreSessionFn = (userId: string) => Promise<CreateSessionResult>;

export function makeCoreAuth(config: BaseAuthConfig) {
  const { storage, sessionCodec, sessionTransport, sessionTtl, debug } = config;

  // Result helpers with optional debug logging
  const result: ResultHelpers = {
    ok: <T extends object>(data: T) => ({ success: true as const, ...data }),

    fail: (error: AuthErrorCode, err?: unknown) => {
      if (debug) console.error(`[auth] ${error}`, err);

      return { success: false as const, error };
    },
  };

  const storeSession: StoreSessionFn = async (userId) => {
    const sessionId = generateSessionId();
    const isForever = sessionTtl === Infinity;
    const sessionExp = isForever ? null : new Date(Date.now() + sessionTtl);

    await storage.session.store({ sessionId, userId, expiresAt: sessionExp });

    const token = await sessionCodec.encode({ sessionId, sessionExp, userId });
    const responseToken = sessionTransport.set(token);

    return result.ok({ session: { token: responseToken, userId } });
  };

  const methods: CoreMethods = {
    async createSession({ userId }) {
      return storeSession(userId);
    },

    async getSession() {
      const token = sessionTransport.get();
      if (!token) return null;

      const decoded = await sessionCodec.decode(token);
      // TODO: Idea:
      // const decoded = await sessionCodec.decode(token, storage.session);

      if (!decoded) {
        return null;
      }

      const now = new Date();

      // Check sessionExp first (null = forever, never expires)
      const sessionExpired =
        decoded.sessionExp !== null && decoded.sessionExp < now;
      if (sessionExpired) {
        // User inactive too long — sign out
        return null;
      }

      const isForever = sessionTtl === Infinity;

      // Token expired (tokenExp passed) — DB fallback for revocation check
      if (decoded.expired) {
        const storedSession = await storage.session.get(decoded.sessionId);

        if (!storedSession) {
          // Session revoked — sign out
          return null;
        }

        // Update DB expiresAt for sliding refresh (if not forever)
        const newSessionExp = isForever
          ? null
          : new Date(Date.now() + sessionTtl);

        if (!isForever) {
          await storage.session.store({
            sessionId: decoded.sessionId,
            userId: storedSession.userId,
            expiresAt: newSessionExp,
          });
        }

        // Issue fresh token with NEW tokenExp, NEW sessionExp
        const freshToken = await sessionCodec.encode({
          sessionId: decoded.sessionId,
          sessionExp: newSessionExp,
          userId: storedSession.userId,
          // tokenExp omitted = generate new
        });

        sessionTransport.set(freshToken);

        return { userId: storedSession.userId };
      }

      // Token valid — issue fresh token with SAME exp, NEW sessionExp
      const newSessionExp = isForever
        ? null
        : new Date(Date.now() + sessionTtl);

      const freshToken = await sessionCodec.encode(
        {
          sessionId: decoded.sessionId,
          sessionExp: newSessionExp,
          userId: decoded.userId,
        },
        { expiresAt: decoded.exp }, // preserve existing exp
      );
      sessionTransport.set(freshToken);

      return { userId: decoded.userId };
    },

    async signOut() {
      const token = sessionTransport.get();

      if (token) {
        const decoded = await sessionCodec.decode(token);

        if (decoded) {
          await storage.session.delete(decoded.sessionId);
        }
      }

      sessionTransport.clear();
    },
  };

  return { methods, storeSession, result };
}
