# Usage API

> **Status** Active API design spike. The construction model, session split, and call convention below are settled in this spike's contracts and runtime candidate. Names remain provisional until promotion into the main spike contract.

## Objective

Prove one small server API that is easy to wire into any framework while its configuration remains explicit, extensible, and independent of session, storage, token, and framework mechanisms.

## Mental model

`makeAuth` is a small authentication microkernel with two arguments. The session adapter comes first. The strategy map callback comes second.

The vocabulary:

- **Kernel** — `makeAuth`. Takes exactly two inputs, one session and a map of strategies.
- **Session** — the role that represents signed in state. One per app.
- **Strategy** — the role that proves who a user is. Zero or more, mounted under caller chosen names.
- **Mechanism** — a shipped implementation of either role, delivered as a `make*` factory. Strategy mechanisms come as an engine plus a small wrapper that mounts it on the kernel.
- **Adapter** — the storage and delivery functions a mechanism consumes. Hand written or shipped, they are the trust boundary to your infrastructure.
- **Binding** — environment glue that moves credential values between a transport and the API. Zero logic.

_You satisfy the kernel's two inputs, mechanisms build those inputs from adapters, adapters touch your infrastructure._

Every level is an exit ramp — implement any contract directly and the levels above it disappear.

```ts
const auth = makeAuth(session, (kernel) => ({
  emailOtp: makeOtpStrategy(kernel, emailOtpConfig),
  passkeys: makePasskeyStrategy(kernel, passkeyConfig),
}));

await auth.session.get(token);
await auth.strategies.emailOtp.authenticate({ identifier, otp });
await auth.strategies.passkeys.verifyRegistration(token, { credential });
```

- The callback receives the narrow strategy kernel and returns the final namespace map. Namespace names are caller chosen literal keys that core never enumerates, so unlimited strategy types and multiple instances of one mechanism compose without core changes.
- auth is a module singleton. Construction touches no request.
- Operations that use current session authority take the presented session token as their first positional argument. All other operation inputs arrive in one args object. The token is a string, whatever value the application extracted from its transport.
- Created credentials are mechanism defined values returned in results. Bindings move credential values between core and an environment. Core never reads or writes transport.
- The public surface nests every strategy under `auth.strategies`. `auth.session` carries `get` plus the capabilities the configured mechanism offers.
- Direct session creation does not exist. Bespoke authentication is an explicit strategy. Session only auth is the empty strategy map, `makeAuth(session, () => ({}))`.

The primary boundary is:

> Auth owns proofs, authentication workflows, and the lifecycle of authentication artifacts. The application owns users, identity data, and business consequences. DI lets auth invoke application-owned decisions without owning the application's data model.

## Strategy bundles

A strategy bundle is a function of the kernel. One API serves three levels of granularity, and each tier is the previous one written out.

```ts
const auth = makeAuth(session, emailOtp);

const auth = makeAuth(session, otpStrategy({ ttl: 600_000 }));

const auth = makeAuth(session, (kernel) => ({
  ...otpStrategy({ ttl: 600_000 })(kernel),
  google: makeOidcStrategy(kernel, googleConfig),
}));
```

Preconfigured setups ship per half, a session preset plus a strategy preset. Framework helpers are postponed until the examples show what repeat code people actually write.

The exact shipped OTP and passkey factory APIs are not settled. The sandboxes prove only that any complete object satisfying `OtpEngine` or `PasskeyEngine` composes correctly. The playground's bundle factories are illustrative shapes, not decisions, and an application or third party package may implement the strategy contracts directly.

## Scope rule

The library ships ceremonies and proofs only. Everything else is application code over application storage.

- In: OTP issuance and proof, passkey registration and authentication ceremonies, session establishment, current identity resolution, current session capabilities such as end and refresh.
- Out: listing and removing passkeys, listing sessions, sign out everywhere, email management. These are reads and writes on tables the application owns, carrying application policy such as last credential rules. The examples implement them storage direct, and repeated patterns there decide what earns abstraction later.
- Emails are application identity data in an application owned table. The library contributes proof of address ownership through the OTP primitive, planned as an independently importable export, and the application writes its own tables.
- The capability model stays in core because session mechanisms differ in which current session operations are meaningful. A fixed lifecycle surface would invent meaningless methods for some mechanisms or amputate real ones from others, so each mechanism declares exactly its own.

## Session contract split

The kernel's internal session dependency and the public session API are separate contracts. `SessionKernel` has exactly two operations. `establish` creates the configured session for the exact userId supplied by core and returns mechanism defined credential values. `resolve` performs a repeatable read only resolution of the presented token. Renewal is an explicit capability, never a hidden write inside a read.

`SessionAdapter` pairs that fixed kernel port with a capability object. Core maps `resolve` to public `session.get` and projects the capability object unchanged. Each capability defines its own signature, including which presented credentials it requires, which is how a mechanism with separate access and refresh credentials stays explicit. A capability named `get` is rejected at the type level.

The session implementation may expose application defined claims together with `userId`. Core requires only `userId` and treats additional claims as opaque.

### Session authority and access

An opaque credential is an unguessable reference to authoritative server state. A signed credential is a client-carried snapshot trusted through its signature. Memoizing an opaque lookup and issuing a signed snapshot for the same duration make the same bounded-staleness promise. They differ in where the snapshot lives and why it is trusted.

A renew capability on an opaque session must reject an unknown, ended, or expired session and extend its lifetime in one atomic storage operation.

Short-lived signed access can retain opaque persisted authority as its refresh credential. Refresh resolves current authority and issues a new snapshot. It does not inherently rotate the authority credential. A signed access snapshot must not outlive its authority, so its expiry is capped by the authority credential's expiry.

A denylist-backed signed session has no persisted positive authority. Its credential may span the complete session lifetime. Each credential carries a unique identifier, and validation rejects identifiers present in the denylist. Ending the session records the credential identifier in the denylist. A denylist entry is needed only until that credential expires. This mechanism does not inherently support refresh or active-session listing.

The contract must represent persisted opaque sessions, signed access backed by persisted authority, signed sessions backed by a denylist, and custom semantic sessions without mechanism branches in core. Representable, shipped, and recommended are distinct coverage levels, and all four families must be representable. A self-contained signed session with neither persisted authority nor denylist-backed revocation is outside required production coverage because it cannot revoke one session before expiry.

Previously issued signed credentials retain their claims until they expire or additional revocation state rejects them. Updating claims therefore requires refreshed or replacement credentials, or accepting bounded staleness. A denylist mechanism changes claims only by issuing a replacement credential and denying the previous one. Signed credentials provide integrity, not confidentiality, so claims must not depend on their contents being hidden.

For signed credential mechanisms, `validate` means complete credential acceptance including integrity, structure, and expiry. `verify` names only the narrower cryptographic check.

[`session-capability-typecheck.ts`](./src/session-capability-typecheck.ts) pressure tests this split against direct opaque access, signed access backed by persisted authority, a denylist-backed signed session, and a custom session with a binary credential and no lifecycle capabilities.

## Execution boundaries

There is no reader API. The read and write split lives at the platform, not in the library surface.

- Conventional servers and meta frameworks hold one singleton. Requests pass the token in, and read only contexts such as RSC render simply never call operations that write.
- Convex mutations receive storage capabilities per invocation, so the session adapter and auth are constructed inside the handler. The strategies half stays static module level code.
- Convex queries can construct no write capable adapter, so they construct no auth at all. The session mechanism's read operation is the entire surface there.

The [Convex example](../../examples/convex-react/otp/convex/lib.ts) exercises these shapes with separate read and write storage capabilities.

## Strategy kernel

Strategies receive `authenticate` and `current` and nothing else, never the session implementation or its capabilities. `authenticate` establishes a session for exactly the user returned by a successful proof and establishes nothing on failure. `current` resolves the presented token when a workflow needs current user authority, such as adding a passkey to the signed in user.

Core contains no debug flag because core swallows no causes. A shipped mechanism that catches an exception and returns a sanitized error code takes its own debug flag, since the log is the only correct channel for the swallowed cause.

## Current files

| Location                                                                     | Role                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`src/contracts.ts`](./src/contracts.ts)                                     | Public construction, session, OTP, and passkey contracts                                   |
| [`src/make-auth.ts`](./src/make-auth.ts)                                     | Runtime microkernel with no mechanism branches                                             |
| [`src/contracts-typecheck.ts`](./src/contracts-typecheck.ts)                 | Compile-time proofs for construction, projection, strategy boundaries, and exact inference |
| [`src/session-capability-typecheck.ts`](./src/session-capability-typecheck.ts) | Compile-time proofs for capability-dependent session surfaces                              |
| [`src/mechanisms/`](./src/mechanisms/)                                       | Environment-free session, OTP, and passkey mechanisms                                      |

The intended library has more than one public layer.

| Layer                           | Candidate library exports                                           | Ownership                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Microkernel API                 | `makeAuth` and its contract types                                   | Composition, authenticated-user to session transition, current-user scoping, and public projection        |
| Shipped mechanisms and adapters | Environment-free factories producing session and strategy contracts | Token mechanics, OTP behavior, passkey behavior, persistence protocols, and other reusable auth machinery |
| Framework bindings              | Entry points that move request context and credential values        | Environment glue only                                                                                     |
| Microkernel internals           | None                                                                | Strategy kernel construction and session projection                                                       |
| Application code                | None                                                                | User lookup, application policy, concrete storage and delivery connections, and final composition         |

## Core and strategy ownership

Core keeps the behavior that must remain identical across strategies. A strategy must establish an authenticated user before core creates a session. Core passes that exact userId to the injected session implementation. Current user workflows derive userId from the presented token and never accept an arbitrary public userId.

Feature strategies own everything specific to their authentication method. OTP request policy, generation, expiry, persistence, delivery, verification, consumption, and identifier to user resolution. Passkey user provisioning, WebAuthn, challenges, credentials, and counters. Future OIDC exchanges or other feature workflows.

The session implementation is likewise trusted. It decides whether a presented token establishes an identity and owns its complete lifecycle. Adapters are trust boundaries, and core does not compensate for an incorrect custom implementation.

## DI boundaries

A DI operation exists when core must call it independently. Core may need to:

- Invoke it from a different public operation or server request.
- Branch before invoking it.
- Interpose a cross-strategy security invariant.
- Supply current-session authority.

Implementation steps that core only runs together belong behind one semantic operation. Splitting them would expose mechanics without giving core a useful decision point.

Consequences in this candidate:

- OTP has independent `request` and `authenticate` operations because they happen in separate requests. Generation, storage, delivery, verification, policy, and user resolution are not separate DIs.
- Passkey ceremony operations remain independent because starts and completions span requests.
- The session kernel port contains only `establish` and `resolve` because those are the only decisions shared by every session-establishing strategy and current-user workflow.
- Session capabilities remain independent when the configured implementation exposes them because renewal, refresh, and termination are not meaningful for every mechanism.

The rule is not simply that two functions appear consecutively. The library may keep a boundary when it must conditionally invoke the second operation or enforce a security invariant between them.

## Application users

Strategies do not repeat a generic user lookup DI. OTP binds a verified external identifier to an application user through its config. Passkey authentication establishes userId from the verified credential. Passkey registration may provision a new application user. There is no user adapter, and identity data such as email addresses lives in application tables.

## OIDC boundary

Consumer side OIDC is a future authentication strategy beside OTP and passkeys, already proven as an arbitrary third-party namespace in [`src/contracts-typecheck.ts`](./src/contracts-typecheck.ts). Making ΛUTH an OIDC or OAuth provider is a separate identity server product and out of scope.

## Relationship to the other spikes

The earlier strategy-composition and session-lifecycle spikes supplied the evidence that settled this construction. Their surviving contract proofs and session model are now represented in this package. The old spike files are no longer authoritative.
