# Session architecture

> **Status:** Active session-boundary design. The usage API spike owns builder composition. The code in this directory is supporting evidence, not a second contract.

## Objective

Settle the session boundary of `makeAuth` well enough to resume contract tests
with confidence.

This document keeps the reasoning needed to make that decision. It is not a
transcript, and it does not reduce a group of coupled design questions to a
contrived next action.

The boundary is credible when one small public API can represent the session
mechanisms and execution environments we care about without hiding writes,
inventing meaningless values, or adding mechanism-specific branches to core.

## Fixed boundaries

| Decision               | Meaning                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product structure      | `makeAuth` receives one mandatory session implementation. OTP and passkeys are optional authentication strategies. This work covers only the session boundary.                                                 |
| Users                  | The application owns users and gives session creation an opaque, application-authorized `userId`. There is no user adapter.                                                                                    |
| Authentication         | An installed strategy resolves an application user and core establishes that user's session. Session-only auth exposes direct creation for bespoke authentication.                                             |
| Session ownership      | The session implementation owns credential shape, persistence, lifetime policy, and its useful lifecycle and management capabilities.                                                                         |
| Dependency injection   | Configuration is complete and explicit. There are no defaults or optional dependencies. Convenience factories may produce complete configurations.                                                             |
| Transport              | Core does not read or write cookies, headers, local storage, requests, or responses. Bindings move credential values between core and an environment.                                                          |
| Session reads          | Checking a session is repeatable and read-only. Renewal and persistence updates are explicit, separate behavior.                                                                                               |
| Custom implementations | Core does not try to make an incorrectly written custom session implementation safe. We make shipped mechanisms correct and support custom authors with contracts, documentation, examples, tests, and skills. |
| Target support         | The API must permit SSR, CSR, RSC, mobile, conventional servers, and Convex without core changes. We do not need to ship every binding on day one.                                                             |

Legacy code, `SPEC.md`, the main spike, and the nested spike are evidence. None
is a contract that the final design must preserve.

## Why the design was reopened

The legacy `getSession()` performs this whole sequence:

```text
read transport
  → decode token, including an expired token
  → enforce inactivity
  → sometimes check and update persistence
  → mint another token
  → write transport
  → return userId
```

It therefore places transport, token mechanics, persistence, and lifetime
policy in core. It also makes an apparent read mutate state.

That is troublesome for two independent reasons:

- RSC rendering, SSR reads, and Convex queries need validation without renewal
  or writes.
- The algorithm encodes one session design: a self-contained credential with
  cached session data, periodic persistence checks, and sliding renewal.

A database-backed opaque credential and a signed credential can expose the
same session data with the same bounded-staleness policy. They differ in where
the session snapshot is held and why it is trusted. The problem is not merely
how to clean up `getSession()`. The problem is deciding which parts are session
authority, access representation, and universal core behavior.

## Working model

An opaque credential is an unguessable reference to current session state:

```text
opaque credential → authoritative store → current session
```

A signed credential is a session snapshot carried by the client:

```text
signed credential → signature verification → issued session snapshot
```

Memoizing an opaque lookup for ten seconds and issuing a signed session
snapshot for ten seconds make the same consistency promise: authentication may
observe session state that is at most ten seconds stale. The cache location and
trust mechanism differ:

| Representation            | Snapshot location | Why the snapshot is trusted |
| ------------------------- | ----------------- | --------------------------- |
| Memoized opaque lookup    | Server cache      | The server owns the cache   |
| Short-lived signed access | Client credential | The issuer's signature      |

Signed access therefore does not need a second kind of session authority. The
opaque authority credential that would otherwise be presented as access is
retained as the refresh credential. Refresh resolves current authoritative
state and issues another short-lived snapshot. It does not inherently rotate
the authority credential.

The candidate makes that relationship explicit:

```ts
const authority = makeOpaqueSessionAuthority({
  storage,
  lifetime,
  makeSessionId,
  makeCredential,
  now,
});

makeAuth({ debug: true, session: makeOpaqueSession({ authority }) });

makeAuth({
  debug: true,
  session: makeSignedAccessSession({
    authority,
    access: {
      codec: signedSessionCodec,
      ttl: 10_000,
    },
    now,
  }),
});
```

These are convenience compositions, not two branches in `makeAuth`.

A third mechanism can use a longer-lived signed credential with a denylist as revocation state:

```text
signed credential → signature verification + denylist check → issued session snapshot
```

It has no persisted positive session authority and does not inherently need refresh. It also cannot naturally list active sessions from a store that records only revoked credentials. This mechanism is important because it exposes lifecycle operations that cannot be universal without inventing semantics.

## Evidence from the nested spike

The code in this directory tries one lifecycle against two access
representations over the same opaque authority shape:

| Concern          | Short-lived signed access                   | Direct opaque access                                     |
| ---------------- | ------------------------------------------- | -------------------------------------------------------- |
| Authority        | Opaque credential retained as refresh       | Opaque credential presented as access                    |
| Validate         | Verify the signed session snapshot          | Resolve current state, optionally through a server cache |
| Refresh          | Resolve authority and issue a new snapshot  | Update server-side lifetime and retain the credential    |
| Revoke           | Delete the opaque authority                 | Delete the opaque authority                              |
| Read capability  | No persistence needed for access validation | Persistence read required                                |
| Write capability | Required for create, refresh, and revoke    | Required for create, refresh, and revoke                 |

The experiment established that:

- Credential transport can remain outside core.
- Validation can remain read-only.
- Both mechanisms can resemble `create`, `validate`, `refresh`, and `end`.
- Read-only and write-capable environments can be represented separately.
- Signed and direct opaque access can use the same authoritative storage
  contract.
- Refresh-token rotation is independent of signed access and must not be
  implied by every short access-token lifetime.

It did **not** establish that:

- Those four operations are universal rather than artifacts of these examples.
- `access` plus nullable `refresh` is the right shared credential value.
- Generic `ReadContext` and `WriteContext` belong in the public API.
- A `makeAuth` facade that mostly forwards adapter calls earns its layer.

The nested spike is a proof attempt, not a second contract.

## Required mechanism coverage

The session contract must be able to represent persisted opaque sessions, short-lived signed access backed by persisted authority, long-lived signed sessions backed by a denylist, and custom semantic session implementations. A mechanism must not need a special branch in core merely because its credential shape, persistence, lifetime policy, or useful operations differ.

These are levels of support, not synonyms:

- **Representable:** the contract permits the mechanism without changing core.
- **Shipped:** the library provides an implementation.
- **Recommended:** the library presents the mechanism as an appropriate default for a documented use case.

All four mechanism categories must be representable. Which implementations ship or are recommended is a later decision.

## Current ownership direction

The configured session implementation owns the complete session lifecycle and policy. Mechanism factories such as `makeOpaqueSession` and `makeSignedAccessSession` may compose lower-level storage, codecs, clocks, and credential generation, but `makeAuth` does not orchestrate those mechanism details or branch on token format.

The kernel retains only the universal control plane: it establishes a session after successful authentication, resolves the current identity where another auth operation requires it, and projects the configured implementation's supported capabilities into the public session namespace. The exact minimal internal contract and capability projection remain open.

The nested code's complete semantic session adapter remains useful evidence for this direction. Its optional `.withSession(...)` builder composition has been superseded by the mandatory session configuration in the usage API spike.

The ownership rule is:

> A behavior belongs in core only when every supported session mechanism needs
> core to make the same decision.

## Coupled questions

These questions constrain each other. Answering one without the others would
produce another superficially neat but unproven API.

| Question                                     | Context needed to answer it                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is the minimal internal session port?   | Establishing a session and resolving current identity are known kernel needs. Any additional universal operation must be justified across opaque, signed-access, denylist-backed, and custom implementations.                                                                                                          |
| How are public capabilities projected?       | Session-only auth exposes direct creation, while installed strategies reserve creation for core. Other operations such as refresh, listing, bulk termination, and revocation appear only when the configured implementation supports them. The exact TypeScript representation remains open.                          |
| What are session credentials?                | Direct opaque access presents its authority credential. Signed access retains an opaque authority credential for refresh. A denylist-backed signed session may have no refresh credential. Bindings still need an explicit way to know which values to store and present.                                                |
| How do invocation-scoped capabilities enter? | Configuration must remain complete, but Convex creates database capabilities per query or mutation. They might enter public method inputs, an environment binding, or another explicit composition boundary. The earlier generic `context` proved feasibility, not ownership.                                         |

Lifetime and refresh policy belong to the session implementation. The exact policies and configuration of shipped mechanisms remain parked until this boundary is credible.

## Compatibility targets

Named targets are compatibility probes, not a promise to ship every
integration. A target belongs in the primary set only when it introduces a
distinct execution, persistence, transport, or rendering constraint.

Framework compatibility normally tests a binding, not the `SessionAdapter`
itself:

- A session adapter owns session mechanism and policy.
- A binding moves credential values between that API and an environment.
- Convex may pressure both boundaries because its persistence capabilities are
  created per invocation.

| Target              | Why it was selected                                                                                                                                                 | Boundary stressed               | Role      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| Vanilla Node or Bun | Framework-free floor. Proves the design does not depend on a full-stack framework, a particular router, or framework-owned request context.                         | Binding                         | Primary   |
| TanStack Start      | Representative conventional full-stack case with SSR, CSR, server functions, and server routes. Ensures the ordinary integration remains ergonomic.                 | Binding                         | Primary   |
| Next.js App Router  | Constrained mixed environment: RSC can participate in session reads while credential writes require a write-capable server boundary.                                | Binding and lifecycle           | Primary   |
| Convex              | Queries and mutations have different capabilities and receive database facilities per invocation. This is the strongest test of read/write separation and DI.       | Adapter, binding, and lifecycle | Primary   |
| Expo                | Native clients retain and present credentials without relying on browser cookie behavior.                                                                           | Credential boundary and binding | Primary   |
| Electron            | Desktop clients add protected OS storage plus a privileged main-process boundary that must not leak renewable credentials into the renderer.                        | Credential boundary and binding | Primary   |
| SolidStart          | A non-React full-stack confirmation that the design has not accidentally absorbed React, Next.js, or TanStack assumptions. It adds less new architectural pressure. | Binding                         | Secondary |

Compatibility means that an application can support the target through a
session implementation and/or binding without changing core. It does not mean
the library must ship or maintain that integration on day one.

Other frameworks should initially be classified by the constraints above
rather than added by name. A new target joins the primary set only when it
reveals a capability shape that the existing representatives do not exercise.

## How the design will converge

There is no single context-free question to answer next. The ownership,
lifecycle, credential, and invocation-capability shapes need to be developed
together against representative cases.

Small type and implementation probes should show that the same candidate boundary can describe:

- A database-backed opaque session.
- A short-lived signed session snapshot with a persisted opaque authority credential.
- A longer-lived signed session with denylist-backed revocation and no refresh requirement.
- A custom semantic session implementation without a core change.

The compatibility targets then test whether those mechanisms can be used in
the required environments without changing core.

Each probe should make five boundaries visible:

1. The values entering and leaving the public session operation.
2. The layer that validates credentials.
3. The layer that reads or mutates persistence.
4. The layer that owns renewal and revocation.
5. The point where invocation-scoped capabilities enter.

A candidate is not ready to land if a representative case requires:

- A framework-specific change to core.
- A write during validation.
- A meaningless credential field.
- A token-format branch in core.
- Session policy with no clear owner or test boundary.

Types and minimal implementation may evolve together while proving this. The
point is to converge on one coherent boundary, not to obey an arbitrary
sequence.

## Parked until that boundary is credible

- Exact access, absolute, inactivity, and cookie lifetime rules.
- Authority-credential rotation, replay detection, concurrency, and recovery.
- Cookie names, attributes, and browser or mobile storage.
- Concrete framework bindings.
- The final JWT or HMAC codec API.
- Migration from the legacy implementation.
- Reconciliation of `SPEC.md`, `TODO.md`, and package documentation.
- Resumption of the HMAC codec testing pilot.

## Current code status

- `../contracts.ts` still contains the earlier mandatory-session design and is
  unchanged while this candidate is explored.
- `contracts.ts` contains the earlier optional-unit candidate and shared session lifecycle. Its composition has been superseded, while its session shapes remain evidence.
- `composition-probes.ts` checks the superseded optional-unit composition, order independence, and single-use builder steps.
- `mechanisms.ts` minimally implements direct opaque access and signed access
  over one opaque-authority contract.
- `target-probes.ts` checks read-only and write-capable execution targets plus
  client credential persistence.
- The nested candidate should not receive comprehensive tests or production
  hardening until the boundary has survived the representative probes.
