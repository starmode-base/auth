/**
 * Compile-time sandbox for execution-boundary usage.
 *
 * auth is a module singleton wherever the platform allows one; operations
 * receive the presented credential as an argument. A platform that supplies
 * storage capabilities per invocation constructs the session adapter inside
 * the handler. A read-only invocation constructs no auth at all; the session
 * mechanism's read operation is its entire surface. Public auth methods stay
 * free of framework context.
 */
import type {
  SessionAdapter,
  SessionIdentity,
  WithOtpConfig,
} from "./contracts";
import { makeAuth } from "./contracts";
import type {
  IssuedSessionCredentials,
  PresentedSessionCredentials,
  SessionAdapter as LifecycleSession,
} from "../session-lifecycle/contracts";
import type {
  OpaqueSessionStorage,
  SessionAuthorityLifetime,
  SignedSessionCodec,
} from "../session-lifecycle/mechanisms";
import {
  makeOpaqueSession,
  makeOpaqueSessionAuthority,
  makeSignedAccessSession,
} from "../session-lifecycle/mechanisms";

type ReadContext = {
  sessionReader: unknown;
};

type WriteContext = ReadContext & {
  sessionWriter: unknown;
};

declare const storage: OpaqueSessionStorage<ReadContext, WriteContext>;
declare const lifetime: SessionAuthorityLifetime;
declare const signedSessionCodec: SignedSessionCodec;
declare const makeSessionId: () => string;
declare const makeCredential: () => string;
declare const now: () => Date;
declare const readContext: ReadContext;
declare const writeContext: WriteContext;
declare const accessToken: string | null;
declare const presentedCredentials: PresentedSessionCredentials;

const authority = makeOpaqueSessionAuthority({
  storage,
  lifetime,
  makeSessionId,
  makeCredential,
  now,
});

const opaqueLifecycle = makeOpaqueSession({ authority });
const signedAccessLifecycle = makeSignedAccessSession({
  authority,
  access: {
    codec: signedSessionCodec,
    ttl: 10_000,
  },
  now,
});

function bindWriteSession(
  session: LifecycleSession<ReadContext, WriteContext>,
  context: WriteContext,
) {
  const capabilities = {
    refresh: (presented: PresentedSessionCredentials) =>
      session.refresh(context, presented),
    end: (presented: PresentedSessionCredentials) =>
      session.end(context, presented),
  };

  return {
    kernel: {
      establish: (userId: string) => session.create(context, userId),
      resolve: (credential: string | null) =>
        credential === null
          ? Promise.resolve(null)
          : session.validate(context, credential),
    },
    capabilities,
  } satisfies SessionAdapter<
    SessionIdentity,
    IssuedSessionCredentials,
    typeof capabilities
  >;
}

/* Conventional servers hold one singleton; requests pass credentials in. */

const serverAuth = makeAuth(
  bindWriteSession(signedAccessLifecycle, writeContext),
  () => ({}),
);

void serverAuth.session.get(accessToken);
void serverAuth.session.refresh(presentedCredentials);
void serverAuth.session.end(presentedCredentials);

// @ts-expect-error Direct session creation does not exist.
void serverAuth.session.create;

// @ts-expect-error Framework context never crosses a public method.
void serverAuth.session.get({ context: readContext });

/* Next.js RSC renders read through the same singleton and never write. */

void serverAuth.session.get(accessToken);

/* Convex queries construct no auth; the mechanism read is the surface. */

const queryViewer =
  accessToken === null
    ? Promise.resolve(null)
    : opaqueLifecycle.validate(readContext, accessToken);

void queryViewer;

// @ts-expect-error A read context cannot establish sessions.
void opaqueLifecycle.create(readContext, "user-1");

/* Convex mutations bind per-invocation storage, then authenticate normally. */

type ResolvedUser = {
  userId: string;
  isNew: boolean;
};

declare const otp: WithOtpConfig<ResolvedUser>;

const mutationAuth = makeAuth(
  bindWriteSession(opaqueLifecycle, writeContext),
  (kernel) => ({
    otp: {
      authenticate: (args: { identifier: string; otp: string }) =>
        kernel.authenticate(() => otp.authenticate(args)),
    },
  }),
);

void mutationAuth.strategies.otp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
});
void mutationAuth.session.get(accessToken);
void mutationAuth.session.end(presentedCredentials);

// @ts-expect-error The write binding requires a write-capable context.
void bindWriteSession(opaqueLifecycle, readContext);
