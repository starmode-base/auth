import type {
  IssuedSessionCredential,
  IssuedSessionCredentials,
  SessionAdapter,
} from "./contracts";

/** Current session state held by an authoritative session store */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  absoluteExpiresAt: Date | null;
  inactiveExpiresAt: Date | null;
};

/** Session data returned by an authority or carried by signed access */
export type SessionSnapshot = {
  sessionId: string;
  userId: string;
};

/** An opaque authority credential together with the session it resolves */
export type AuthoritySession = {
  credential: IssuedSessionCredential;
  session: SessionSnapshot;
};

/**
 * Authoritative session lifecycle.
 *
 * The credential is an unguessable reference to current session state.
 * resolve is read-only. renew may update server-side lifetime but does not
 * inherently rotate the credential. end revokes the credential.
 */
export type SessionAuthority<ReadContext, WriteContext> = {
  create: (context: WriteContext, userId: string) => Promise<AuthoritySession>;
  resolve: (
    context: ReadContext,
    credential: string,
  ) => Promise<SessionSnapshot | null>;
  renew: (
    context: WriteContext,
    credential: string,
  ) => Promise<AuthoritySession | null>;
  end: (context: WriteContext, credential: string) => Promise<void>;
};

/**
 * Signed session-snapshot codec.
 *
 * A JWT implementation maps issuing to encode and full signature, issuer,
 * audience, and expiration verification to validate. Invalid and expired
 * credentials return null.
 */
export type SignedSessionCodec = {
  encode: (session: SessionSnapshot, expiresAt: Date) => Promise<string>;
  validate: (credential: string) => Promise<SessionSnapshot | null>;
};

/** Lifetime of the authoritative session */
export type SessionAuthorityLifetime = {
  absoluteTtl: number | null;
  inactivityTtl: number | null;
};

/**
 * Persistence used by the shipped opaque session authority.
 *
 * get is read-only. renew must atomically reject an unknown, inactive, or
 * absolutely expired credential; otherwise it updates inactiveExpiresAt and
 * returns the current session. renew does not rotate the credential.
 */
export type OpaqueSessionStorage<ReadContext, WriteContext> = {
  create: (
    context: WriteContext,
    credential: string,
    record: SessionRecord,
  ) => Promise<void>;
  get: (
    context: ReadContext,
    credential: string,
  ) => Promise<SessionRecord | null>;
  renew: (
    context: WriteContext,
    credential: string,
    now: Date,
    inactiveExpiresAt: Date | null,
  ) => Promise<SessionRecord | null>;
  delete: (context: WriteContext, credential: string) => Promise<void>;
};

/** Input for the shipped opaque session authority */
export type MakeOpaqueSessionAuthorityConfig<ReadContext, WriteContext> = {
  storage: OpaqueSessionStorage<ReadContext, WriteContext>;
  lifetime: SessionAuthorityLifetime;
  makeSessionId: () => string;
  makeCredential: () => string;
  now: () => Date;
};

/** Builds an authoritative database-backed session with an opaque credential */
export function makeOpaqueSessionAuthority<ReadContext, WriteContext>(
  config: MakeOpaqueSessionAuthorityConfig<ReadContext, WriteContext>,
): SessionAuthority<ReadContext, WriteContext> {
  return {
    async create(context, userId) {
      const now = config.now();
      const credential = config.makeCredential();
      const record: SessionRecord = {
        sessionId: config.makeSessionId(),
        userId,
        absoluteExpiresAt: deadline(now, config.lifetime.absoluteTtl),
        inactiveExpiresAt: deadline(now, config.lifetime.inactivityTtl),
      };

      await config.storage.create(context, credential, record);

      return makeAuthoritySession(credential, record);
    },

    async resolve(context, credential) {
      const record = await config.storage.get(context, credential);

      return record === null || isExpired(record, config.now())
        ? null
        : makeSessionSnapshot(record);
    },

    async renew(context, credential) {
      const now = config.now();
      const record = await config.storage.renew(
        context,
        credential,
        now,
        deadline(now, config.lifetime.inactivityTtl),
      );

      return record === null ? null : makeAuthoritySession(credential, record);
    },

    async end(context, credential) {
      await config.storage.delete(context, credential);
    },
  };
}

/** Input for presenting an authority credential directly as access */
export type MakeOpaqueSessionConfig<ReadContext, WriteContext> = {
  authority: SessionAuthority<ReadContext, WriteContext>;
};

/** Builds sessions that present their authority credential directly as access */
export function makeOpaqueSession<ReadContext, WriteContext>(
  config: MakeOpaqueSessionConfig<ReadContext, WriteContext>,
): SessionAdapter<ReadContext, WriteContext> {
  return {
    async create(context, userId) {
      const authoritative = await config.authority.create(context, userId);

      return {
        access: authoritative.credential,
        refresh: null,
      };
    },

    async validate(context, accessToken) {
      const session = await config.authority.resolve(context, accessToken);
      return session === null ? null : { userId: session.userId };
    },

    async refresh(context, credentials) {
      if (credentials.access === null) {
        return null;
      }

      const authoritative = await config.authority.renew(
        context,
        credentials.access,
      );

      return authoritative === null
        ? null
        : {
            access: authoritative.credential,
            refresh: null,
          };
    },

    async end(context, credentials) {
      if (credentials.access !== null) {
        await config.authority.end(context, credentials.access);
      }
    },
  };
}

/** Input for signed access over an opaque session authority */
export type MakeSignedAccessSessionConfig<ReadContext, WriteContext> = {
  authority: SessionAuthority<ReadContext, WriteContext>;
  access: {
    codec: SignedSessionCodec;
    ttl: number;
  };
  now: () => Date;
};

/**
 * Builds short-lived signed session snapshots over an opaque session
 * authority. The authority credential is retained across access renewal.
 */
export function makeSignedAccessSession<ReadContext, WriteContext>(
  config: MakeSignedAccessSessionConfig<ReadContext, WriteContext>,
): SessionAdapter<ReadContext, WriteContext> {
  return {
    async create(context, userId) {
      const authoritative = await config.authority.create(context, userId);
      return issueSignedAccessCredentials(config, authoritative);
    },

    async validate(context, accessToken) {
      void context;

      const session = await config.access.codec.validate(accessToken);
      return session === null ? null : { userId: session.userId };
    },

    async refresh(context, credentials) {
      if (credentials.refresh === null) {
        return null;
      }

      const authoritative = await config.authority.renew(
        context,
        credentials.refresh,
      );

      return authoritative === null
        ? null
        : issueSignedAccessCredentials(config, authoritative);
    },

    async end(context, credentials) {
      if (credentials.refresh !== null) {
        await config.authority.end(context, credentials.refresh);
      }
    },
  };
}

async function issueSignedAccessCredentials<ReadContext, WriteContext>(
  config: MakeSignedAccessSessionConfig<ReadContext, WriteContext>,
  authoritative: AuthoritySession,
): Promise<IssuedSessionCredentials> {
  const expiresAt = earliestRequired(
    new Date(config.now().getTime() + config.access.ttl),
    authoritative.credential.expiresAt,
  );
  const token = await config.access.codec.encode(
    authoritative.session,
    expiresAt,
  );

  return {
    access: {
      token,
      expiresAt,
    },
    refresh: authoritative.credential,
  };
}

function makeAuthoritySession(
  credential: string,
  record: SessionRecord,
): AuthoritySession {
  return {
    credential: {
      token: credential,
      expiresAt: earliestOptional(
        record.absoluteExpiresAt,
        record.inactiveExpiresAt,
      ),
    },
    session: makeSessionSnapshot(record),
  };
}

function makeSessionSnapshot(record: SessionRecord): SessionSnapshot {
  return {
    sessionId: record.sessionId,
    userId: record.userId,
  };
}

function deadline(now: Date, ttl: number | null): Date | null {
  return ttl === null ? null : new Date(now.getTime() + ttl);
}

function earliestRequired(required: Date, optional: Date | null): Date {
  return optional === null || required < optional ? required : optional;
}

function earliestOptional(
  first: Date | null,
  second: Date | null,
): Date | null {
  if (first === null) {
    return second;
  }

  if (second === null) {
    return first;
  }

  return first < second ? first : second;
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
