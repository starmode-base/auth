# Usage API

> **Status:** Active API design spike. Names are provisional; the ownership,
> composition, and public workflow model are the subject of this experiment.

## Objective

Prove one small server API that is easy to wire into any framework while its
configuration remains explicit, extensible, and independent of session,
storage, token, and framework mechanisms.

## Mental model

`makeAuth` is an authentication orchestrator, not a collection of proof
primitives.

- Primitives prove facts and remain independently importable.
- `makeAuth` always has a configured session implementation.
- OTP and passkeys chained onto `makeAuth` are authentication strategies.
- Core owns security-sensitive workflow ordering.
- DI supplies mechanisms, application policy, persistence, and user resolution.
- Factories may later produce complete groups of DI, but the literal
  configuration remains the contract.

The primary boundary is:

> Auth owns proofs, authentication workflows, and the lifecycle of
> authentication artifacts. The application owns users, identity data, and
> business consequences. DI lets auth invoke application-owned decisions at
> the correct point without owning the application's data model.

## Builder

Sessions are mandatory because every strategy installed through `makeAuth`
establishes authentication:

```ts
const auth = makeAuth({
  debug: true,
  session,
})
  .withOtp(otpConfig)
  .withPasskey(passkeyConfig);
```

The only supported states are session-only, sessions plus OTP, sessions plus
passkeys, and sessions plus both strategies. OTP proof without authentication
uses its independently exported primitive and is not a builder state.

Session-only auth exposes session creation as the escape hatch for bespoke
authentication. Once a shipped strategy is installed, that strategy retains
session creation internally while applications keep session lookup, renewal,
termination, and management.

## Configuration and usage

Configuration is deliberately complete:

```ts
const auth = makeAuth({ debug: true, session }).withOtp({
  storage,
  delivery,
  generateOtp,
  ttl,
  authorizeRequest,
  resolveUser,
});
```

`authorizeRequest` may deny OTP issuance without revealing the denial.
`resolveUser` runs only after OTP verification and may deny authentication by
returning null. Core creates a session only for the returned userId.

The usage API exposes the completed workflow:

```ts
auth.otp.request(...)
auth.otp.authenticate(...)
```

The primitive remains proof-only:

```ts
otp.request(...)
otp.verify(...)
```

Passkey methods likewise own registration, authentication, session
establishment, and credential management. Registration authorization tokens
or equivalent ceremony state are internal details rather than separate
application-orchestrated methods.

[`playground.ts`](./playground.ts) shows the complete literal configuration,
every supported builder state, and route-sized server operations together.

## Resource ownership

The location of data does not determine operation ownership.

- Sessions, passkeys, challenges, and future recovery credentials exist for
  authentication, so auth owns their lifecycle and management API.
- User profiles, email addresses, roles, onboarding, and account deletion are
  application data and policy.
- Auth-resource methods derive userId from the current session. Self-service
  methods never accept an arbitrary userId.
- Adapters may use the application's database, remote storage, or a hosted
  service without changing the usage API.

Normal authentication and auth-resource server functions should approach a
single call into `auth`. Application actions such as `getViewer` or
`changeEmail` consume session state or independent proof primitives and remain
application workflows.

## Relationship to the other spikes

The session-lifecycle spike explores session authority and access
representations. Its mechanism findings remain useful, but its empty-builder
composition model is superseded here.

Once this usage model survives pressure testing, its settled pieces replace
the corresponding sections of the main spike contract. This directory is not
intended to become a second permanent contract.
