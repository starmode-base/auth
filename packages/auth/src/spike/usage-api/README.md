# Usage API

> **Status:** Active API design spike. Names are provisional; the ownership, composition, and public workflow model are the subject of this experiment.

## Objective

Prove one small server API that is easy to wire into any framework while its configuration remains explicit, extensible, and independent of session, storage, token, and framework mechanisms.

## Mental model

`makeAuth` is a small authentication microkernel.

- Literal objects are the DI contract.
- OTP and passkeys chained onto `makeAuth` are complete trusted authentication strategies.
- Strategy DIs own their feature workflows.
- Core owns composition, the transition from authenticated user to session, and current-user scoping across auth strategies.
- The session kernel port contains only `establish` and `resolve`.
- The session implementation exposes only the additional capabilities its mechanism supports.
- Bindings close over invocation-scoped context and credentials before constructing either a read-only or full session projection.
- Primitives remain independently importable.
- Object-producing helpers are optional compression over the literal contract.

The primary boundary is:

> Auth owns proofs, authentication workflows, and the lifecycle of authentication artifacts. The application owns users, identity data, and business consequences. DI lets auth invoke application-owned decisions without owning the application's data model.

A direct strategy implementation replaces that authentication engine and is therefore a trusted boundary. The normal implementation may be an object produced by library helpers, but `makeAuth` does not distinguish produced objects from inline ones.

## Spike boundaries

Nothing in this directory is exported by the current package entry point. Candidate library export means intended for promotion after the design settles. It does not mean the symbol ships today.

| Location                                                       | Role                              | Intended boundary                                                                                       |
| -------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`contracts.ts`](./contracts.ts)                               | Candidate public contract         | Its exported types and `makeAuth` overloads are proposed library exports                                |
| [`make-auth-sandbox.ts`](./make-auth-sandbox.ts)               | Partial candidate library runtime | `makeAuth` is the only exported candidate. Its namespace and builder constructors are library internals |
| [`strategy-session-sandbox.ts`](./strategy-session-sandbox.ts) | Runnable consumer example         | The session adapter, strategies, WebAuthn fixtures, and calls are userland code                         |
| [`playground.ts`](./playground.ts)                             | Consumer API sketch               | Its file exports make examples easy to inspect but are not proposed package exports                     |
| Typecheck and invocation sandboxes                             | Design evidence                   | They are compile-time probes and framework binding examples, not package modules                        |
| [`strategy-composition/`](./strategy-composition/)             | Competing composition experiment  | It does not change the active candidate until its open strategy model wins                              |

## Core and strategy ownership

Core keeps the behavior that must remain identical across strategies:

- A strategy must establish an authenticated user before core creates a session.
- Core passes that exact userId to the injected session implementation.
- Installed strategies hide direct session creation.
- Resource management derives userId from the current session and never accepts an arbitrary public userId.
- Builder state determines the returned public namespaces.

Feature strategies own everything specific to their authentication method:

- OTP request policy, generation, expiry, persistence, delivery, verification, consumption, authentication policy, and identifier-to-user resolution.
- Passkey user provisioning, policy, WebAuthn, challenges, credentials, counters, and atomic credential removal.
- Future OIDC exchanges, recovery credentials, or other feature-specific workflows.

Core creates a session from a successful strategy result. Strategies never receive the session implementation and cannot create sessions themselves.

The session implementation is likewise trusted. It decides whether presented credentials establish an identity and owns its complete current-session lifecycle operations. A custom session implementation can lie about identity or expose an unsafe management operation, and core cannot compensate for either violation.

## DI boundaries

A DI operation exists when core must call it independently. Core may need to:

- Invoke it from a different public operation or server request.
- Branch before invoking it.
- Interpose a cross-strategy security invariant.
- Supply current-session authority.
- Preserve an atomic boundary.

Implementation steps that core only runs together belong behind one semantic operation. Splitting them would expose mechanics without giving core a useful decision point.

Consequences in this candidate:

- OTP has independent `request` and `authenticate` operations because they happen in separate requests. Generation, storage, delivery, verification, policy, and user resolution are not separate builder DIs.
- Passkey ceremony operations remain independent because starts and completions span requests.
- Passkey removal is one strategy operation. Separating list, authorization, and deletion would make policies such as preserving the last credential vulnerable to races.
- The session kernel port contains only `establish` and `resolve` because those are the only decisions shared by every session-establishing strategy and current-user auth workflow.
- Session capabilities remain independent when the configured implementation exposes them because renewal, refresh, termination, and management are not meaningful for every mechanism.

The rule is not simply that two functions appear consecutively. The library may keep a boundary when it must conditionally invoke the second operation or enforce a security invariant between them.

## Objects, helpers, and primitives

The canonical configuration is a literal object:

```ts
const otp = {
  request: async ({ identifier }) => {
    // Complete OTP issuance.
    return { success: true };
  },
  authenticate: async ({ identifier, otp }) => {
    // Complete OTP verification and application-user resolution.
    return { success: true, data: { userId: "user-1", isNew: true } };
  },
} satisfies WithOtpConfig<User>;

const auth = makeAuth({ debug: true, session }).withOtp(otp);
```

Nothing requires a factory. The same object may be written inline, imported as a fixed preconfigured object, or returned by a helper:

```ts
const auth = makeAuth({
  debug: true,
  session: makeOpaqueSession({ storage, transport, ttl }),
})
  .withOtp(makeResendOtp({ storage, apiKey, resolveUser }))
  .withPasskey(makePasskey({ users, credentials, challenges, webAuthn }));
```

These helper names are illustrative. A helper adds no capability; it only packages construction or retains supplied configuration in the object it returns.

Use the simplest form that fits:

- A one-off implementation can be an inline object.
- A fixed reusable implementation can be an exported vanilla object.
- Repeated parameterized construction can use an object-producing `make*` helper.

Objects returned by helpers remain structurally composable:

```ts
const standardOtp = makeResendOtp(config);

const otp = {
  ...standardOtp,
  request: customRequest,
};
```

Spreading replaces members at the returned contract boundary. It cannot replace an implementation detail already closed over by another member.

Lower-level primitives remain independently importable for applications or third parties that want to assemble their own strategy objects. OTP proof without authentication uses the OTP primitive directly and is not a builder state.

## Builder and usage

Sessions are mandatory because every strategy installed through `makeAuth` establishes authentication:

```ts
const auth = makeAuth({
  debug: true,
  session,
})
  .withOtp(otp)
  .withPasskey(passkey);
```

The only supported states are session-only, sessions plus OTP, sessions plus passkeys, and sessions plus both strategies. Both strategy orders produce the same complete public API.

A read-only invocation is an execution projection rather than a fifth product configuration. Supplying a `SessionReader` to `makeAuth` returns only `session.get` plus the read-safe capabilities supplied by the binding. It exposes neither direct session creation nor authentication strategy builders.

Session-only auth exposes session creation as the escape hatch for bespoke authentication. Once a shipped strategy is installed, that strategy returns an authenticated user to core and core creates the session. Applications retain the lookup, renewal, termination, and management capabilities exposed by the configured session implementation.

| Configuration          | Public session API                                                       |
| ---------------------- | ------------------------------------------------------------------------ |
| Sessions only          | Supported mechanism capabilities, including direct session creation      |
| Sessions plus OTP      | Supported mechanism capabilities, with session creation reserved to core |
| Sessions plus passkeys | Supported mechanism capabilities, with session creation reserved to core |
| Sessions plus both     | Supported mechanism capabilities, with session creation reserved to core |

Strategy configuration determines whether direct session creation is public. The configured session mechanism determines which lifecycle and management operations are meaningful. The exact capability object is preserved in the returned session namespace.

The usage API exposes completed workflows:

```ts
auth.otp.request(...)
auth.otp.authenticate(...)
auth.passkey.createAuthenticationOptions(...)
auth.passkey.verifyAuthentication(...)
auth.session.end() // when the configured session exposes end
```

Normal authentication and auth-resource server functions should approach one call into `auth`. Application actions such as `getViewer` or `changeEmail` consume session state or independent proof primitives and remain application workflows.

## Session contract split

The kernel's internal session dependency and the public session API are separate contracts. `SessionKernel` has exactly two operations. `establish` creates the configured session for the exact userId supplied by core. `resolve` performs a repeatable read-only resolution of the currently presented session.

`SessionAdapter` pairs that fixed kernel port with a capability object. Core maps `establish` to public `session.create` only for session-only auth, maps `resolve` to public `session.get`, and preserves the capability object in every builder state. Operations such as refresh, renewal, listing, bulk termination, and revocation therefore appear only when the configured implementation supplies them.

The session implementation may expose application-defined claims together with `userId`. Core requires only `userId`, preserves the inferred identity type where it crosses the public API, and treats all additional claims as opaque. OTP and passkey strategies neither define nor resolve session claims.

[`session-capability-typecheck.ts`](./session-capability-typecheck.ts) pressure-tests this split against direct opaque access, signed access backed by persisted authority, a denylist-backed signed session, and a custom session with a binary credential and no lifecycle capabilities. No case introduces a credential union, nullable placeholder, token-format branch, or meaningless public method.

## Invocation boundary

Bindings close over framework context and presented credentials when they construct the session object for one invocation. They choose the projection that their environment can actually support:

- `SessionReader` contains read-only `resolve` plus any read-safe public capabilities. `makeAuth` returns a read-only auth facade.
- `SessionAdapter` contains the complete `establish` and `resolve` kernel plus the capabilities available at a write boundary. `makeAuth` returns the normal authentication builder.

```ts
const queryAuth = makeAuth({
  debug: true,
  session: bindSessionRead({ context: queryContext, credentials }),
});

const mutationAuth = makeAuth({
  debug: true,
  session: bindSessionWrite({ context: mutationContext, credentials }),
}).withOtp(otp);
```

Public operations remain context-free after binding. A Convex query or RSC render supplies no fake write operation, while a Convex mutation or conventional request handler retains the full authentication API. [`invocation-sandbox.ts`](./invocation-sandbox.ts) exercises both opaque and signed-access sessions across those targets.

## Strategy orchestration

[`make-auth-sandbox.ts`](./make-auth-sandbox.ts) contains the partial generic library candidate and keeps its namespace constructors private. [`strategy-session-sandbox.ts`](./strategy-session-sandbox.ts) imports only `makeAuth`, supplies inert userland OTP and passkey implementations, and executes them through the public builder chain. OTP authentication returns failures before session establishment. Success passes the exact strategy userId to `establish` and combines the returned user and session result.

Passkey authentication and passkey-first sign-up establish sessions in the same way. Adding a passkey resolves the current session to scope the strategy call and does not establish another session. Listing and removal use the same current-user scope. Strategies receive neither the session kernel nor its public capabilities.

## Application users

Strategies do not repeat a generic user-lookup DI.

- OTP binds a verified external identifier to an application user.
- Passkey authentication already establishes userId from the verified credential.
- Passkey registration may provision a new application user or load an existing one for an authenticated registration.

Those operations have different authority and inputs, so giving them the same callback name would hide rather than remove complexity. Each complete strategy normalizes its successful authentication result to an `AuthUser` containing userId.

If a genuinely identical operation is later required by every strategy, it belongs in `makeAuth` rather than being repeated by `withOtp`, `withPasskey`, and future strategies.

## OIDC boundary

Consumer-side OIDC belongs as a future authentication strategy beside OTP and passkeys. The strategy verifies the external identity, the application maps its issuer and subject to an application-owned `userId`, and core creates the local session through the configured session implementation.

Making ΛUTH an OIDC or OAuth provider is a separate identity-server product and is out of scope.

## Resource ownership and projections

The location of data does not determine operation ownership.

- Sessions, passkeys, challenges, and future recovery credentials exist for authentication, so auth owns their lifecycle and management API.
- User profiles, email addresses, roles, onboarding, and account deletion are application data and policy.
- Adapters may use the application's database, remote storage, or a hosted service without changing the usage API.

Session and passkey lists return application-defined safe projections rather than raw storage records. A session implementation owns its optional listing capability and projection. Core requires `credentialId` from passkey projections because it scopes passkey removal itself.

```ts
type SessionListItem = {
  sessionId: string;
  deviceName: string;
  createdAt: Date;
};

type PasskeyListItem = PasskeySummary & {
  name: string;
  lastUsedAt: Date | null;
};
```

These are safe public projections, never raw storage records. This allows an adapter to enrich hosted or local authentication data without exposing secret tokens, public keys, counters, or internal policy state.

[`playground.ts`](./playground.ts) shows the complete literal objects, every supported builder state, inferred management projections, and route-sized server operations together.

## Relationship to the other spikes

The session-lifecycle spike is supporting evidence for session authority, access representations, and execution targets. Its mechanisms are reused by the capability pressure tests here. Its optional-session builder and fixed four-operation adapter are superseded and should not evolve as competing contracts.

The capability and invocation sandboxes complete the required mechanism and execution-boundary pressure tests. The strategy orchestration sandbox completes the authentication transition proof without becoming a production implementation. After this candidate is reviewed, the settled usage model replaces the corresponding sections of the main spike contract. The session-lifecycle directory is then removed rather than maintained as a second permanent contract.
