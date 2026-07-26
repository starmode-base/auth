# Session lifecycle

> **Status:** Active design work.
>
> **Current question:** Should `makeAuth` delegate all session behavior to one semantic `SessionAdapter`?

## Objective

Settle the public session boundary for `makeAuth`.

We are not designing the complete session implementation yet. We are deciding what core owns and what a configured session component owns.

The result should be one small typed contract that can later support different session mechanisms and environments without changing core.

## Scope

This work covers only:

- `makeAuth`.
- Session management.
- The boundary between core and its session configuration.
- The boundary between application-owned users and sessions.

It does not currently cover:

- OTP or passkeys.
- JWT, HMAC, or opaque implementation details.
- TTLs, expiry, or sliding sessions.
- Cookies, headers, HTTP, or framework bindings.
- Refresh rotation and concurrency.
- Legacy implementation or documentation updates.

## Settled decisions

### `makeAuth` is the session foundation

The library remains split into three semantic modules:

```text
makeAuth       sessions, always present
withOtp        OTP, optional
withPasskey    passkeys, optional
```

OTP and passkeys are outside this session discussion.

### The library does not manage users

The application owns users and every policy surrounding them.

The library receives an opaque application-authorized `userId`. It does not create, load, verify, link, merge, suspend, or delete users.

There will be no user adapter.

### Verification and session creation are separate

Authentication or identity verification produces a fact. Application code decides whether to create a session and supplies the corresponding `userId`.

### Configuration is complete and explicit

There are no defaults and no optional dependencies. Convenience factories may produce complete configurations for common setups.

### Existing artifacts are inputs, not constraints

Legacy code, `SPEC.md`, the main spike, and this nested spike contain useful evidence. They do not need to be preserved when the final API is chosen.

Documents and implementation are reconciled after the typed API settles.

### A session read must be read-only

The legacy `getSession()` mixes validation with persistence updates, token renewal, and transport writes.

The new API must separate:

- A repeatable read-only session check.
- Any operation that renews credentials or updates session state.

### Core does not perform transport I/O

Core does not read or write cookies, headers, request arguments, local storage, or HTTP responses.

Bindings may do that later by passing credential values into session operations and persisting returned values.

## Current provisional candidate

The main spike currently models:

```ts
type MakeAuthConfig = {
  session: SessionAdapter;
  debug: boolean;
};
```

The proposed `SessionAdapter` owns the complete session lifecycle:

- Creation.
- Read-only validation.
- Refresh.
- Revocation.
- Credential mechanics.
- Persistence.
- Time policy.

`makeAuth` would then be a thin public facade that owns namespaces and `Result` conventions.

This direction is promising because custom session policies and mechanisms would not require core changes.

It is **not settled**. Promoting it also introduced several unreviewed decisions at once:

- `create`, `validate`, `refresh`, and `end` as the universal operations.
- A common access-token and nullable-refresh-token representation.
- No public execution context.
- Removal of storage and codec contracts from core.

The nested `session-lifecycle` implementation is evidence for this candidate, not the contract.

## Active open question

### Who owns the session lifecycle?

Choose between:

#### Complete semantic adapter

`makeAuth` receives one `SessionAdapter`. The adapter owns all session behavior, while core exposes a stable public facade.

#### Core orchestration

`makeAuth` receives lower-level collaborators such as storage and codecs. Core owns the behavior that coordinates them.

The decision rule is:

> Behavior belongs in core only if it is truly universal across signed, opaque, database-backed, and custom session designs.

No other session question should be decided until this boundary is firm.

## Parked questions

After the active question is resolved, consider these one at a time:

1. What exactly does `session.create` accept and return?
2. What exactly does read-only session validation accept and return?
3. Is explicit `refresh` universal?
4. What does `session.end` receive and guarantee?
5. Is access plus nullable refresh the right common credential shape?
6. Where do invocation-scoped facilities such as Convex context enter?
7. Does validation return only `userId` or also `sessionId`?
8. How do access expiry, absolute lifetime, and inactivity lifetime work?
9. How do bindings carry and retain credentials?
10. How do refresh rotation, concurrency, replay, and failure recovery work?

## Current code status

- `../contracts.ts` contains the provisional complete-adapter design.
- This directory contains the earlier context-aware exploration and mechanism sketches.
- The HMAC codec test pilot is separate and paused.
- No additional implementation or tests should be added until the active question is answered.

## Next action

Answer one question:

> Should `makeAuth` delegate the complete session lifecycle to `SessionAdapter`?

Then update only this document and the smallest corresponding type boundary.
