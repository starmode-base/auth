/**
 * Compile-time sandbox for invocation-scoped session capabilities.
 *
 * Bindings close over framework context and presented credentials when they
 * construct a session projection. Read-only invocations receive only resolve;
 * write-capable invocations receive the complete authentication kernel and
 * their meaningful lifecycle capabilities. Public auth methods stay free of
 * framework context.
 */
import type {
  SessionAdapter,
  SessionIdentity,
  SessionReader,
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
declare const credentials: PresentedSessionCredentials;

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

function bindReadSession(
  session: LifecycleSession<ReadContext, WriteContext>,
  context: ReadContext,
  presentedAccessToken: string | null,
): SessionReader<SessionIdentity, object> {
  return {
    kernel: {
      resolve: () =>
        presentedAccessToken === null
          ? Promise.resolve(null)
          : session.validate(context, presentedAccessToken),
    },
    capabilities: {},
  };
}

function bindWriteSession(
  session: LifecycleSession<ReadContext, WriteContext>,
  context: WriteContext,
  presented: PresentedSessionCredentials,
) {
  const capabilities = {
    refresh: () => session.refresh(context, presented),
    end: () => session.end(context, presented),
  };

  return {
    kernel: {
      establish: (userId: string) => session.create(context, userId),
      resolve: () =>
        presented.access === null
          ? Promise.resolve(null)
          : session.validate(context, presented.access),
    },
    capabilities,
  } satisfies SessionAdapter<
    SessionIdentity,
    IssuedSessionCredentials,
    typeof capabilities
  >;
}

/* Next.js RSC binds only cookie and persistence reads. */

const rscAuth = makeAuth({
  debug: true,
  session: bindReadSession(opaqueLifecycle, readContext, accessToken),
});

void rscAuth.session.get();

// @ts-expect-error A read-only render cannot establish a session.
void rscAuth.session.create;

// @ts-expect-error A read-only render cannot install authentication strategies.
void rscAuth.withOtp;

// @ts-expect-error The read binding did not expose refresh.
void rscAuth.session.refresh;

/* Convex queries receive a read capability and no fake mutation capability. */

const convexQueryAuth = makeAuth({
  debug: true,
  session: bindReadSession(signedAccessLifecycle, readContext, accessToken),
});

void convexQueryAuth.session.get();

// @ts-expect-error A Convex query cannot establish a session.
void convexQueryAuth.session.create;

// @ts-expect-error A Convex query cannot refresh or mutate session state.
void convexQueryAuth.session.refresh;

/* Convex mutations bind the write capability used by authentication. */

type ResolvedUser = {
  userId: string;
  isNew: boolean;
};

declare const otp: WithOtpConfig<ResolvedUser>;

const convexMutationAuth = makeAuth({
  debug: true,
  session: bindWriteSession(opaqueLifecycle, writeContext, credentials),
}).withOtp(otp);

void convexMutationAuth.otp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
});
void convexMutationAuth.session.get();
void convexMutationAuth.session.refresh();
void convexMutationAuth.session.end();

// @ts-expect-error The write projection requires a write-capable context.
void bindWriteSession(opaqueLifecycle, readContext, credentials);

/* Conventional request handlers use the same write-capable projection. */

const requestAuth = makeAuth({
  debug: true,
  session: bindWriteSession(signedAccessLifecycle, writeContext, credentials),
});

void requestAuth.session.create({ userId: "user-1" });
void requestAuth.session.get();
void requestAuth.session.refresh();
void requestAuth.session.end();

// @ts-expect-error Framework context is closed over by the binding.
void requestAuth.session.get({ context: readContext });
