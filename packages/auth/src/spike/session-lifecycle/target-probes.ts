/**
 * Compile-time integration probes for the candidate session lifecycle.
 *
 * These are deliberately framework-free. They model the capabilities each
 * binding can provide and verify that neither core nor a session mechanism
 * needs to change between targets.
 */
import type {
  IssuedSessionCredentials,
  IssuedSessionCredential,
  PresentedSessionCredentials,
  SessionIdentity,
  SessionUnit,
} from "./contracts";
import { makeSessionUnit } from "./make-session-unit";
import type {
  OpaqueSessionStorage,
  SessionAuthorityLifetime,
  SignedSessionCodec,
} from "./mechanisms";
import {
  makeOpaqueSession,
  makeOpaqueSessionAuthority,
  makeSignedAccessSession,
} from "./mechanisms";

type ReadContext = {
  sessionReader: unknown;
};

type WriteContext = ReadContext & {
  sessionWriter: unknown;
};

type CandidateAuth = SessionUnit<ReadContext, WriteContext>;

declare const storage: OpaqueSessionStorage<ReadContext, WriteContext>;
declare const lifetime: SessionAuthorityLifetime;
declare const signedSessionCodec: SignedSessionCodec;
declare const makeSessionId: () => string;
declare const makeCredential: () => string;
declare const now: () => Date;

const authority = makeOpaqueSessionAuthority({
  storage,
  lifetime,
  makeSessionId,
  makeCredential,
  now,
});

const signedAccessAuth: CandidateAuth = makeSessionUnit({
  session: makeSignedAccessSession({
    authority,
    access: {
      codec: signedSessionCodec,
      ttl: 10_000,
    },
    now,
  }),
});

const opaqueAuth: CandidateAuth = makeSessionUnit({
  session: makeOpaqueSession({ authority }),
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
  auth: signedAccessAuth,
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
  auth: signedAccessAuth,
  context: writeContext,
  credentials,
});
void refreshRequest({
  auth: opaqueAuth,
  context: writeContext,
  credentials,
});

type PersistCredentials = (
  credentials: IssuedSessionCredentials,
) => Promise<void>;

async function refreshClientSession(
  target: WriteTarget,
  persistCredentials: PersistCredentials,
): Promise<void> {
  const refreshed = await refreshRequest(target);

  if (refreshed !== null) {
    await persistCredentials(refreshed);
  }
}

/*
 * Browser bindings persist each credential and its own expiry in separate
 * HttpOnly cookies.
 */
declare const setAccessCookie: (
  credential: IssuedSessionCredential,
) => Promise<void>;
declare const setRefreshCookie: (
  credential: IssuedSessionCredential | null,
) => Promise<void>;

const persistBrowserCredentials: PersistCredentials = async (issued) => {
  await setAccessCookie(issued.access);
  await setRefreshCookie(issued.refresh);
};

/*
 * Expo and Electron keep the access credential in memory. Durable protected
 * storage holds the renewable credential: refresh when present, otherwise the
 * opaque access credential itself.
 */
type NativeCredentialStorage = {
  set: (credential: NativeStoredCredential) => Promise<void>;
  get: () => Promise<NativeStoredCredential | null>;
};

type NativeStoredCredential =
  | {
      kind: "access";
      credential: IssuedSessionCredential;
    }
  | {
      kind: "refresh";
      credential: IssuedSessionCredential;
    };

declare const setMemoryAccess: (credential: IssuedSessionCredential) => void;
declare const expoSecureStorage: NativeCredentialStorage;
declare const electronSecureStorage: NativeCredentialStorage;

function makeNativeCredentialPersistence(
  storage: NativeCredentialStorage,
): PersistCredentials {
  return async (issued) => {
    setMemoryAccess(issued.access);

    await storage.set(
      issued.refresh === null
        ? { kind: "access", credential: issued.access }
        : { kind: "refresh", credential: issued.refresh },
    );
  };
}

async function readNativeCredentials(
  storage: NativeCredentialStorage,
): Promise<PresentedSessionCredentials> {
  const stored = await storage.get();

  if (stored === null) {
    return { access: null, refresh: null };
  }

  return stored.kind === "access"
    ? { access: stored.credential.token, refresh: null }
    : { access: null, refresh: stored.credential.token };
}

void refreshClientSession(
  {
    auth: signedAccessAuth,
    context: writeContext,
    credentials,
  },
  persistBrowserCredentials,
);
void refreshClientSession(
  {
    auth: opaqueAuth,
    context: writeContext,
    credentials,
  },
  makeNativeCredentialPersistence(expoSecureStorage),
);
void refreshClientSession(
  {
    auth: signedAccessAuth,
    context: writeContext,
    credentials,
  },
  makeNativeCredentialPersistence(electronSecureStorage),
);

void readNativeCredentials(expoSecureStorage);
void readNativeCredentials(electronSecureStorage);

/*
 * Convex receives a separate audience-bound identity token derived from the
 * authoritative session. An opaque session handle is never passed to Convex
 * as though it were a JWT.
 */
type ConvexTokenFetcher = (args: {
  forceRefreshToken: boolean;
}) => Promise<string | null>;

declare const issueConvexIdentityToken: (
  identity: SessionIdentity,
) => Promise<string>;

function makeConvexTokenFetcher(
  target: WriteTarget,
  persistCredentials: PersistCredentials,
): ConvexTokenFetcher {
  return async ({ forceRefreshToken }) => {
    let access = target.credentials.access;

    if (forceRefreshToken || access === null) {
      const refreshed = await refreshRequest(target);

      if (refreshed === null) {
        return null;
      }

      await persistCredentials(refreshed);
      access = refreshed.access.token;
    }

    const identity = await target.auth.session.validate({
      context: target.context,
      accessToken: access,
    });

    return identity === null ? null : issueConvexIdentityToken(identity);
  };
}

const fetchSignedAccessConvexToken = makeConvexTokenFetcher(
  {
    auth: signedAccessAuth,
    context: writeContext,
    credentials,
  },
  persistBrowserCredentials,
);
const fetchOpaqueConvexToken = makeConvexTokenFetcher(
  {
    auth: opaqueAuth,
    context: writeContext,
    credentials,
  },
  makeNativeCredentialPersistence(expoSecureStorage),
);

void fetchSignedAccessConvexToken({ forceRefreshToken: true });
void fetchOpaqueConvexToken({ forceRefreshToken: false });

void signedAccessAuth.session.refresh({
  // @ts-expect-error A read-only RSC or query context cannot refresh a session.
  context: readContext,
  credentials,
});
