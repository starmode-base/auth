import type { IssuedSessionCredentials, SessionAdapter } from "./contracts";

/** Session state persisted by the candidate mechanisms */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  absoluteExpiresAt: Date | null;
  inactiveExpiresAt: Date | null;
};

/** The claims carried by a signed access token */
export type AccessTokenClaims = {
  sessionId: string;
  userId: string;
};

/**
 * Signed access-token codec.
 *
 * A JWT adapter maps signing to encode and full JWT verification, including
 * expiration, to validate. Invalid and expired tokens return null.
 */
export type AccessTokenCodec = {
  encode: (claims: AccessTokenClaims, expiresAt: Date) => Promise<string>;
  validate: (token: string) => Promise<AccessTokenClaims | null>;
};

/** Session lifetime policy owned by a session mechanism */
export type SessionLifetime = {
  accessTtl: number;
  absoluteTtl: number | null;
  inactivityTtl: number | null;
};

/**
 * Refresh-token persistence.
 *
 * rotate must atomically reject an unknown, previously used, inactive, or
 * absolutely expired current token; otherwise it replaces the token, updates
 * inactiveExpiresAt, and returns the updated session.
 */
export type RefreshTokenStorage<WriteContext> = {
  create: (
    context: WriteContext,
    refreshToken: string,
    record: SessionRecord,
  ) => Promise<void>;
  rotate: (
    context: WriteContext,
    currentRefreshToken: string,
    nextRefreshToken: string,
    now: Date,
    inactiveExpiresAt: Date | null,
  ) => Promise<SessionRecord | null>;
  delete: (context: WriteContext, refreshToken: string) => Promise<void>;
};

/** Input for a signed-access, opaque-refresh session mechanism */
export type MakeRefreshableSessionsConfig<WriteContext> = {
  accessToken: AccessTokenCodec;
  refreshTokenStorage: RefreshTokenStorage<WriteContext>;
  lifetime: SessionLifetime;
  makeSessionId: () => string;
  makeRefreshToken: () => string;
  now: () => Date;
};

/**
 * Builds sessions with a short-lived signed access token and a rotating opaque
 * refresh token.
 */
export function makeRefreshableSessions<ReadContext, WriteContext>(
  config: MakeRefreshableSessionsConfig<WriteContext>,
): SessionAdapter<ReadContext, WriteContext> {
  return {
    async create(context, userId) {
      const now = config.now();
      const record: SessionRecord = {
        sessionId: config.makeSessionId(),
        userId,
        absoluteExpiresAt: deadline(now, config.lifetime.absoluteTtl),
        inactiveExpiresAt: deadline(now, config.lifetime.inactivityTtl),
      };
      const refreshToken = config.makeRefreshToken();
      const credentials = await issueRefreshableCredentials(
        config,
        record,
        refreshToken,
        now,
      );

      await config.refreshTokenStorage.create(context, refreshToken, record);

      return credentials;
    },

    async validate(context, accessToken) {
      void context;

      const claims = await config.accessToken.validate(accessToken);
      return claims === null ? null : { userId: claims.userId };
    },

    async refresh(context, credentials) {
      if (credentials.refreshToken === null) {
        return null;
      }

      const now = config.now();
      const nextRefreshToken = config.makeRefreshToken();
      const inactiveExpiresAt = deadline(now, config.lifetime.inactivityTtl);
      const record = await config.refreshTokenStorage.rotate(
        context,
        credentials.refreshToken,
        nextRefreshToken,
        now,
        inactiveExpiresAt,
      );

      if (record === null) {
        return null;
      }

      return issueRefreshableCredentials(config, record, nextRefreshToken, now);
    },

    async end(context, credentials) {
      if (credentials.refreshToken !== null) {
        await config.refreshTokenStorage.delete(
          context,
          credentials.refreshToken,
        );
      }
    },
  };
}

/**
 * Opaque-session persistence.
 *
 * refresh must atomically reject an unknown, inactive, or absolutely expired
 * token; otherwise it updates inactiveExpiresAt and returns the session.
 */
export type OpaqueSessionStorage<ReadContext, WriteContext> = {
  create: (
    context: WriteContext,
    accessToken: string,
    record: SessionRecord,
  ) => Promise<void>;
  get: (
    context: ReadContext,
    accessToken: string,
  ) => Promise<SessionRecord | null>;
  refresh: (
    context: WriteContext,
    accessToken: string,
    now: Date,
    inactiveExpiresAt: Date | null,
  ) => Promise<SessionRecord | null>;
  delete: (context: WriteContext, accessToken: string) => Promise<void>;
};

/** Input for an opaque session mechanism */
export type MakeOpaqueSessionsConfig<ReadContext, WriteContext> = {
  storage: OpaqueSessionStorage<ReadContext, WriteContext>;
  lifetime: {
    absoluteTtl: number | null;
    inactivityTtl: number | null;
  };
  makeSessionId: () => string;
  makeAccessToken: () => string;
  now: () => Date;
};

/** Builds sessions whose access token is an opaque server-side session handle */
export function makeOpaqueSessions<ReadContext, WriteContext>(
  config: MakeOpaqueSessionsConfig<ReadContext, WriteContext>,
): SessionAdapter<ReadContext, WriteContext> {
  return {
    async create(context, userId) {
      const now = config.now();
      const accessToken = config.makeAccessToken();
      const record: SessionRecord = {
        sessionId: config.makeSessionId(),
        userId,
        absoluteExpiresAt: deadline(now, config.lifetime.absoluteTtl),
        inactiveExpiresAt: deadline(now, config.lifetime.inactivityTtl),
      };

      await config.storage.create(context, accessToken, record);

      return {
        accessToken,
        refreshToken: null,
      };
    },

    async validate(context, accessToken) {
      const record = await config.storage.get(context, accessToken);

      return record === null || isExpired(record, config.now())
        ? null
        : { userId: record.userId };
    },

    async refresh(context, credentials) {
      if (credentials.accessToken === null) {
        return null;
      }

      const now = config.now();
      const record = await config.storage.refresh(
        context,
        credentials.accessToken,
        now,
        deadline(now, config.lifetime.inactivityTtl),
      );

      return record === null
        ? null
        : {
            accessToken: credentials.accessToken,
            refreshToken: null,
          };
    },

    async end(context, credentials) {
      if (credentials.accessToken !== null) {
        await config.storage.delete(context, credentials.accessToken);
      }
    },
  };
}

async function issueRefreshableCredentials<WriteContext>(
  config: MakeRefreshableSessionsConfig<WriteContext>,
  record: SessionRecord,
  refreshToken: string,
  now: Date,
): Promise<IssuedSessionCredentials> {
  const expiresAt = earliest(
    new Date(now.getTime() + config.lifetime.accessTtl),
    record.absoluteExpiresAt,
    record.inactiveExpiresAt,
  );
  const accessToken = await config.accessToken.encode(
    {
      sessionId: record.sessionId,
      userId: record.userId,
    },
    expiresAt,
  );

  return {
    accessToken,
    refreshToken,
  };
}

function deadline(now: Date, ttl: number | null): Date | null {
  return ttl === null ? null : new Date(now.getTime() + ttl);
}

function earliest(
  required: Date,
  first: Date | null,
  second: Date | null,
): Date {
  const deadlines = [required, first, second].filter(
    (value): value is Date => value !== null,
  );
  let result = required;

  for (const value of deadlines) {
    if (value < result) {
      result = value;
    }
  }

  return result;
}

function isExpired(record: SessionRecord, now: Date): boolean {
  return (
    expired(record.absoluteExpiresAt, now) ||
    expired(record.inactiveExpiresAt, now)
  );
}

function expired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt < now;
}
