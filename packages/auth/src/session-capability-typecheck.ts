/**
 * Compile-time proofs for capability-dependent session surfaces.
 *
 * Every mechanism supplies the same kernel port and only its meaningful public
 * capabilities. Core does not branch on the mechanism or credential shape.
 */
import type {
  AuthUser,
  Result,
  SessionAdapter,
  SessionIdentity,
} from "./contracts";
import { makeAuth } from "./make-auth";
import { makeOpaqueSession } from "./mechanisms/make-opaque-session";

function expectType<T>(value: T): T {
  return value;
}

declare const opaqueSession: ReturnType<typeof makeOpaqueSession>;

const opaqueAuth = makeAuth(opaqueSession, () => ({}));

void opaqueAuth.session.get;
void opaqueAuth.session.end;

// @ts-expect-error Direct session establishment is not public.
void opaqueAuth.session.establish;

// @ts-expect-error Direct opaque access has no separate refresh operation.
void opaqueAuth.session.refresh;

// @ts-expect-error The opaque mechanism does not provide session listing.
void opaqueAuth.session.list;

type AuthorityBackedCredential = {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  authorityExpiresAt: Date;
};

type RefreshedAccess = {
  accessToken: string;
  accessExpiresAt: Date;
};

type AuthorityBackedCapabilities = {
  refresh: (refreshToken: string) => Promise<RefreshedAccess>;
  end: (refreshToken: string) => Promise<void>;
};

declare const authorityBackedSession: SessionAdapter<
  SessionIdentity,
  AuthorityBackedCredential,
  AuthorityBackedCapabilities
>;

const authorityBackedAuth = makeAuth(authorityBackedSession, () => ({}));

void authorityBackedAuth.session.get;
void authorityBackedAuth.session.refresh;
void authorityBackedAuth.session.end;

// @ts-expect-error Direct session establishment is not public.
void authorityBackedAuth.session.establish;

// @ts-expect-error Access refresh does not expose authority rotation separately.
void authorityBackedAuth.session.renew;

// @ts-expect-error Authority persistence does not imply session listing.
void authorityBackedAuth.session.list;

type DenylistIdentity = SessionIdentity & {
  tokenId: string;
};

type DenylistCredential = {
  token: string;
  expiresAt: Date;
};

type DenylistCapabilities = {
  end: (token: string) => Promise<void>;
};

declare const denylistSession: SessionAdapter<
  DenylistIdentity,
  DenylistCredential,
  DenylistCapabilities
>;

const denylistAuth = makeAuth(denylistSession, () => ({}));

void denylistAuth.session.get;
void denylistAuth.session.end;

// @ts-expect-error Direct session establishment is not public.
void denylistAuth.session.establish;

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

declare const customSession: SessionAdapter<
  CustomIdentity,
  CustomCredential,
  {}
>;
declare const customProof: () => Promise<Result<AuthUser, never>>;

const customAuth = makeAuth(customSession, (kernel) => ({
  custom: {
    authenticate: () => kernel.authenticate(customProof),
  },
}));

void customAuth.session.get;

// @ts-expect-error Direct session establishment is not public.
void customAuth.session.establish;

// @ts-expect-error A minimal custom implementation invents no end operation.
void customAuth.session.end;

// @ts-expect-error A minimal custom implementation invents no refresh operation.
void customAuth.session.refresh;

async function customProbe(): Promise<void> {
  const identity = await customAuth.session.get("presented-token");

  if (identity !== null) {
    expectType<string>(identity.organizationId);
    expectType<"custom">(identity.assurance);
  }

  const authentication = await customAuth.strategies.custom.authenticate();

  if (authentication.success) {
    expectType<Uint8Array>(authentication.data.session.value);
  }
}

void customProbe;
