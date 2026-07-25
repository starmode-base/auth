import type { Result } from "../contracts";

/**
 * Credentials issued when a session is created or refreshed.
 *
 * Every mechanism issues an access token. Mechanisms that use the access
 * token itself as the server-side session handle return a null refresh token.
 */
export type IssuedSessionCredentials = {
  accessToken: string;
  refreshToken: string | null;
};

/**
 * Credentials presented by a client.
 *
 * Either credential may be absent independently. In particular, a short-lived
 * access-token cookie may expire while its refresh-token cookie remains.
 */
export type PresentedSessionCredentials = {
  accessToken: string | null;
  refreshToken: string | null;
};

/** The authenticated session data exposed by core */
export type SessionIdentity = {
  userId: string;
};

/**
 * Session lifecycle adapter.
 *
 * The adapter owns session policy and credential mechanics. ReadContext need
 * only support validation; WriteContext supplies the capabilities required by
 * session creation, refresh, and revocation.
 */
export type SessionAdapter<ReadContext, WriteContext> = {
  create: (
    context: WriteContext,
    userId: string,
  ) => Promise<IssuedSessionCredentials>;
  validate: (
    context: ReadContext,
    accessToken: string,
  ) => Promise<SessionIdentity | null>;
  refresh: (
    context: WriteContext,
    credentials: PresentedSessionCredentials,
  ) => Promise<IssuedSessionCredentials | null>;
  end: (
    context: WriteContext,
    credentials: PresentedSessionCredentials,
  ) => Promise<void>;
};

/** Config for the candidate session-only core */
export type MakeSessionAuthConfig<ReadContext, WriteContext> = {
  session: SessionAdapter<ReadContext, WriteContext>;
};

/** Candidate session namespace shared by every session mechanism */
export type SessionNamespace<ReadContext, WriteContext> = {
  create: (args: {
    context: WriteContext;
    userId: string;
  }) => Promise<Result<IssuedSessionCredentials, never>>;
  validate: (args: {
    context: ReadContext;
    accessToken: string | null;
  }) => Promise<SessionIdentity | null>;
  refresh: (args: {
    context: WriteContext;
    credentials: PresentedSessionCredentials;
  }) => Promise<Result<IssuedSessionCredentials, "invalid_token">>;
  end: (args: {
    context: WriteContext;
    credentials: PresentedSessionCredentials;
  }) => Promise<Result<void, never>>;
};

/** Candidate auth shape used by the session-lifecycle spike */
export type SessionAuth<ReadContext, WriteContext> = {
  session: SessionNamespace<ReadContext, WriteContext>;
};
