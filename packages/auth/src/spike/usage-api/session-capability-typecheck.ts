/**
 * Compile-time pressure tests for the microkernel session split.
 *
 * Each session implementation supplies the same two-operation kernel port and
 * only its meaningful public capabilities. The authentication kernel does not
 * branch on the mechanism or impose one credential shape.
 */
import type { SessionAdapter, SessionIdentity } from "./contracts";
import { makeAuth } from "./contracts";
import type {
  IssuedSessionCredential,
  IssuedSessionCredentials,
  PresentedSessionCredentials,
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

const opaqueCapabilities = {
  renew: () => opaqueLifecycle.refresh(writeContext, presentedCredentials),
  end: () => opaqueLifecycle.end(writeContext, presentedCredentials),
};

const opaqueSession = {
  kernel: {
    establish: (userId: string) => opaqueLifecycle.create(writeContext, userId),
    resolve: () =>
      accessToken === null
        ? Promise.resolve(null)
        : opaqueLifecycle.validate(readContext, accessToken),
  },
  capabilities: opaqueCapabilities,
} satisfies SessionAdapter<
  SessionIdentity,
  IssuedSessionCredentials,
  typeof opaqueCapabilities
>;

const opaqueAuth = makeAuth({ debug: true, session: opaqueSession });

void opaqueAuth.session.create;
void opaqueAuth.session.get;
void opaqueAuth.session.renew;
void opaqueAuth.session.end;

// @ts-expect-error Direct opaque access has no separate access refresh.
void opaqueAuth.session.refresh;

// @ts-expect-error The authority contract does not provide session listing.
void opaqueAuth.session.list;

const signedAccessLifecycle = makeSignedAccessSession({
  authority,
  access: {
    codec: signedSessionCodec,
    ttl: 10_000,
  },
  now,
});

const signedAccessCapabilities = {
  refresh: () =>
    signedAccessLifecycle.refresh(writeContext, presentedCredentials),
  end: () => signedAccessLifecycle.end(writeContext, presentedCredentials),
};

const signedAccessSession = {
  kernel: {
    establish: (userId: string) =>
      signedAccessLifecycle.create(writeContext, userId),
    resolve: () =>
      accessToken === null
        ? Promise.resolve(null)
        : signedAccessLifecycle.validate(readContext, accessToken),
  },
  capabilities: signedAccessCapabilities,
} satisfies SessionAdapter<
  SessionIdentity,
  IssuedSessionCredentials,
  typeof signedAccessCapabilities
>;

const signedAccessAuth = makeAuth({
  debug: true,
  session: signedAccessSession,
});

void signedAccessAuth.session.create;
void signedAccessAuth.session.get;
void signedAccessAuth.session.refresh;
void signedAccessAuth.session.end;

// @ts-expect-error Access refresh does not expose authority renewal separately.
void signedAccessAuth.session.renew;

// @ts-expect-error The authority contract does not provide session listing.
void signedAccessAuth.session.list;

type DenylistIdentity = SessionIdentity & {
  tokenId: string;
};

type DenylistSession = {
  issue: (userId: string) => Promise<IssuedSessionCredential>;
  validateCurrent: () => Promise<DenylistIdentity | null>;
  denyCurrent: () => Promise<void>;
};

declare const denylist: DenylistSession;

const denylistCapabilities = {
  end: () => denylist.denyCurrent(),
};

const denylistSession = {
  kernel: {
    establish: (userId: string) => denylist.issue(userId),
    resolve: () => denylist.validateCurrent(),
  },
  capabilities: denylistCapabilities,
} satisfies SessionAdapter<
  DenylistIdentity,
  IssuedSessionCredential,
  typeof denylistCapabilities
>;

const denylistAuth = makeAuth({ debug: true, session: denylistSession });

void denylistAuth.session.create;
void denylistAuth.session.get;
void denylistAuth.session.end;

// @ts-expect-error Denylist-backed signed sessions do not inherently refresh.
void denylistAuth.session.refresh;

// @ts-expect-error A denylist cannot enumerate active sessions.
void denylistAuth.session.list;

type CustomIdentity = SessionIdentity & {
  organizationId: string;
  assurance: "custom";
};

type CustomCredential = {
  value: Uint8Array;
};

type CustomSession = {
  establish: (userId: string) => Promise<CustomCredential>;
  resolve: () => Promise<CustomIdentity | null>;
};

declare const custom: CustomSession;

const customSession = {
  kernel: custom,
  capabilities: {},
} satisfies SessionAdapter<CustomIdentity, CustomCredential, object>;

const customAuth = makeAuth({ debug: true, session: customSession });

void customAuth.session.create;
void customAuth.session.get;

// @ts-expect-error A minimal custom implementation invents no end operation.
void customAuth.session.end;

// @ts-expect-error A minimal custom implementation invents no refresh operation.
void customAuth.session.refresh;

async function readCustomClaims(): Promise<void> {
  const identity = await customAuth.session.get();

  if (identity !== null) {
    void identity.organizationId;
    void identity.assurance;
  }
}

void readCustomClaims;
