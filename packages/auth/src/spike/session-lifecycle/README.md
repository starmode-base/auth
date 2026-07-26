# Session architecture

> **Status:** Converging design work. The main spike contains a provisional
> API, not a settled contract.

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
| Product structure      | `makeAuth` creates an empty base; sessions, OTP, and passkeys are independent optional units. This work covers only the session unit.                                                                          |
| Users                  | The application owns users and gives session creation an opaque, application-authorized `userId`. There is no user adapter.                                                                                    |
| Authentication         | Verification proves something; the application separately decides whether to create a session.                                                                                                                 |
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

A conventional short-lived JWT access token with an opaque refresh token and a
database-backed opaque session have different trust, revocation, and renewal
mechanics. The problem is not merely how to clean up `getSession()`. The
problem is deciding whether core should own a session algorithm at all.

## Evidence from the nested spike

The code in this directory tried one lifecycle against two mechanisms:

| Concern          | JWT-like signed access plus opaque refresh                              | Opaque session                                          |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Validate         | Verify the short-lived access token                                     | Look up the opaque token                                |
| Refresh          | Atomically rotate the persisted refresh token and issue new credentials | Update server-side lifetime and retain the opaque token |
| Revoke           | Delete the persisted refresh token                                      | Delete the opaque token                                 |
| Read capability  | No persistence needed for access validation                             | Persistence read required                               |
| Write capability | Required for create, refresh, and revoke                                | Required for create, refresh, and revoke                |

The experiment established that:

- Credential transport can remain outside core.
- Validation can remain read-only.
- Both mechanisms can resemble `create`, `validate`, `refresh`, and `end`.
- Read-only and write-capable environments can be represented separately.

It did **not** establish that:

- Those four operations are universal rather than artifacts of these examples.
- `accessToken` plus nullable `refreshToken` is the right shared value.
- Generic `ReadContext` and `WriteContext` belong in the public API.
- A `makeAuth` facade that mostly forwards adapter calls earns its layer.

The nested spike is a proof attempt, not a second contract.

## Candidates under consideration

|                | Complete semantic session adapter                                                                  | Core orchestration                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Configuration  | One component implementing the session lifecycle                                                   | Lower-level storage, codec, clock, and token-generation collaborators                            |
| Policy owner   | The configured session component                                                                   | `makeAuth`                                                                                       |
| Main benefit   | Custom mechanisms and policies do not require core changes                                         | Common policy is centralized and directly tested in core                                         |
| Main risk      | The common adapter shape may be artificial, and core may become a forwarding facade                | One session algorithm becomes universal policy; variation adds core branches or contract changes |
| Test ownership | Mechanism tests prove session policy; `makeAuth` tests its own public policy and observable wiring | Core tests prove session policy across collaborator shapes                                       |

The nested spike chooses the first candidate provisionally and composes it as
an optional unit:

```ts
makeAuth({ debug: true }).withSession(sessionAdapter);
```

Mechanism factories such as `makeOpaqueSession` and
`makeRefreshableSession` produce the adapter; the builder does not enumerate
session mechanisms. This also permits verification-only configurations such
as `makeAuth({ debug: true }).withOtp(...)`.

That is a plausible direction under active implementation, not a settled
contract. The rule for judging it against the alternative is:

> A behavior belongs in core only when every supported session mechanism needs
> core to make the same decision.

## Coupled questions

These questions constrain each other. Answering one without the others would
produce another superficially neat but unproven API.

| Question                                     | Context needed to answer it                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who owns the lifecycle?                      | We need to know which behavior is actually universal across signed-access, opaque, database-backed, and custom sessions.                                                                                                                                                      |
| What is the public lifecycle?                | `create`, `validate`, `refresh`, and `end` are useful only if each mechanism can implement them without fake inputs, meaningless outputs, or hidden writes.                                                                                                                   |
| What are session credentials?                | A JWT design needs separate access and refresh tokens so a stolen access token cannot refresh the session. An opaque session may expose only one client-held value. Bindings still need to know what to store and present.                                                    |
| How do invocation-scoped capabilities enter? | Configuration must remain complete, but Convex creates database capabilities per query or mutation. They might enter public method inputs, an environment binding, or another explicit composition boundary. The earlier generic `context` proved feasibility, not ownership. |
| Who owns lifetime and refresh policy?        | Access expiry, absolute lifetime, inactivity, renewal, rotation, replay, and concurrency affect the boundary, but specifying them first would accidentally choose the architecture.                                                                                           |

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

Small type and implementation probes should show that the same candidate API
can describe verification-only auth and both session mechanisms:

- An auth object with OTP or passkeys and no session unit.
- A short-lived JWT access token with a persisted, rotating opaque refresh
  token.
- A database-backed opaque session.

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
- Refresh rotation, replay detection, concurrency, and recovery.
- Cookie names, attributes, and browser or mobile storage.
- Concrete framework bindings.
- The final JWT or HMAC codec API.
- Migration from the legacy implementation.
- Reconciliation of `SPEC.md`, `TODO.md`, and package documentation.
- Resumption of the HMAC codec testing pilot.

## Current code status

- `../contracts.ts` still contains the earlier mandatory-session design and is
  unchanged while this candidate is explored.
- `contracts.ts` contains the optional-unit candidate and the shared session
  lifecycle. Issued access and refresh credentials carry their own expiry
  metadata.
- `composition-probes.ts` checks sessionless composition, order independence,
  and single-use builder steps.
- `mechanisms.ts` minimally implements opaque sessions and signed-access,
  rotating-refresh sessions against the same adapter.
- `target-probes.ts` checks read-only and write-capable execution targets plus
  client credential persistence.
- The nested candidate should not receive comprehensive tests or production
  hardening until the boundary has survived the representative probes.
