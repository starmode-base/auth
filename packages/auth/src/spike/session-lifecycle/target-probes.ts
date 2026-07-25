/**
 * Compile-time integration probes for the candidate session lifecycle.
 *
 * These are deliberately framework-free. They model the capabilities each
 * binding can provide and verify that neither core nor a session mechanism
 * needs to change between targets.
 */
import type {
  IssuedSessionCredentials,
  PresentedSessionCredentials,
  SessionAuth,
  SessionIdentity,
} from "./contracts";
import { makeSessionAuth } from "./make-session-auth";
import type {
  MakeOpaqueSessionsConfig,
  MakeRefreshableSessionsConfig,
} from "./mechanisms";
import { makeOpaqueSessions, makeRefreshableSessions } from "./mechanisms";

type ReadContext = {
  sessionReader: unknown;
};

type WriteContext = ReadContext & {
  sessionWriter: unknown;
};

type CandidateAuth = SessionAuth<ReadContext, WriteContext>;

declare const refreshableConfig: MakeRefreshableSessionsConfig<WriteContext>;
declare const opaqueConfig: MakeOpaqueSessionsConfig<ReadContext, WriteContext>;

const refreshableAuth: CandidateAuth = makeSessionAuth({
  session: makeRefreshableSessions<ReadContext, WriteContext>(
    refreshableConfig,
  ),
});

const opaqueAuth: CandidateAuth = makeSessionAuth({
  session: makeOpaqueSessions(opaqueConfig),
});

type ReadTarget = {
  auth: CandidateAuth;
  context: ReadContext;
  accessToken: string | null;
};

type WriteTarget = {
  auth: CandidateAuth;
  context: WriteContext;
  credentials: PresentedSessionCredentials;
};

async function validateRequest({
  auth,
  context,
  accessToken,
}: ReadTarget): Promise<SessionIdentity | null> {
  return auth.session.validate({ context, accessToken });
}

async function refreshRequest({
  auth,
  context,
  credentials,
}: WriteTarget): Promise<IssuedSessionCredentials | null> {
  const refreshed = await auth.session.refresh({
    context,
    credentials,
  });

  return refreshed.success ? refreshed.data : null;
}

declare const readContext: ReadContext;
declare const writeContext: WriteContext;
declare const accessToken: string | null;
declare const credentials: PresentedSessionCredentials;

/*
 * Next.js RSC and Convex queries validate using read-only capabilities.
 * SSR loaders and ordinary API reads have the same shape.
 */
void validateRequest({
  auth: refreshableAuth,
  context: readContext,
  accessToken,
});
void validateRequest({
  auth: opaqueAuth,
  context: readContext,
  accessToken,
});

/*
 * Next.js route handlers and server actions, TanStack Start and SolidStart
 * server functions, Convex mutations, and vanilla handlers refresh using
 * write-capable contexts.
 */
void refreshRequest({
  auth: refreshableAuth,
  context: writeContext,
  credentials,
});
void refreshRequest({
  auth: opaqueAuth,
  context: writeContext,
  credentials,
});

/*
 * Expo and browser clients send the same credential values to a server
 * boundary. Their storage and transport choices do not enter core.
 */
declare const persistClientCredentials: (
  credentials: IssuedSessionCredentials,
) => Promise<void>;

async function refreshClientSession(target: WriteTarget): Promise<void> {
  const refreshed = await refreshRequest(target);

  if (refreshed !== null) {
    await persistClientCredentials(refreshed);
  }
}

void refreshClientSession({
  auth: refreshableAuth,
  context: writeContext,
  credentials,
});
void refreshClientSession({
  auth: opaqueAuth,
  context: writeContext,
  credentials,
});

void refreshableAuth.session.refresh({
  // @ts-expect-error A read-only RSC or query context cannot refresh a session.
  context: readContext,
  credentials,
});
