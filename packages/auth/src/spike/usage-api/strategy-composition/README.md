# Strategy composition comparison

> **Status** Temporary type comparison. The active usage API remains unchanged until one candidate wins.

## Question

The active usage API has fixed OTP and passkey builder states. This comparison asks whether an open set of named authentication strategies can preserve the same compile time guarantees without enumerating every supported combination.

Two construction forms are compared over one shared strategy contract.

```ts
const built = makeAuth({ debug: true, session })
  .addStrategy("otp", otp)
  .addStrategy("google", google);

const mapped = makeAuth({
  debug: true,
  session,
  strategies: {
    otp,
    google,
  },
});
```

Both candidates project the same public surface.

```ts
auth.session.get();
auth.strategies.otp.authenticate(...);
auth.strategies.google.callback(...);
```

## Fixed comparison boundary

The strategy contract and kernel capability are shared. Only the construction syntax differs.

- A strategy mounts one arbitrary public namespace.
- The kernel grants authenticated session establishment and current identity resolution.
- A strategy never receives the session implementation.
- A failed proof establishes no session.
- A successful proof establishes a session for exactly the returned userId.
- Direct session creation is public only when no strategy is installed.
- Multiple instances of one mechanism may be installed under distinct names.

The local session port is a minimal fixture for these claims. It does not settle the active session lifecycle work.

A strategy value in the initial comparison is specialized to the configured session identity and creation result. A separately reusable strategy with a generic `mount` method loses that creation result to `unknown` when either collector infers its namespace. The operation descriptor follow up resolves this for the accumulating builder by applying the configured session result to a reusable strategy definition during installation. It changes the strategy contract rather than repairing arbitrary generic `mount` inference.

## Builder candidate

The builder accumulates one literal name and namespace per call. It rejects a duplicate name when TypeScript knows that name and localizes an invalid strategy error to the call that installs it.

There is no terminal full state in an open system. The builder remains available for another distinct strategy name.

## Configuration map candidate

The map infers literal names and exact namespaces when it receives a direct object literal. A value checked with `satisfies StrategyMap` retains the same precision.

An explicit broad `StrategyMap` annotation widens the keys to `string`. That loses knowledge of which names are installed. The type probes preserve this behavior as evidence rather than presenting the map as unconditionally exact.

Object spread may also replace an existing property before `makeAuth` receives the map. The resulting object contains no duplicate for the type system to reject.

## Claims under comparison

[`contracts-typecheck.ts`](./contracts-typecheck.ts) checks both candidates against the same claims.

- Installed namespaces retain their exact operation and error types.
- Uninstalled namespaces are unavailable.
- The configured session creation result crosses authentication unchanged.
- Direct session creation disappears after any strategy is installed.
- Strategy installation order does not change the resulting surface.
- Two OIDC instances retain distinct provider types.
- An unfamiliar third party namespace requires no core type change.
- Invalid strategy values and unknown root configuration are rejected.
- A direct map and a map built with `satisfies` retain literal names.
- A broadly annotated map demonstrates its deliberate loss of name precision.
- A reusable generic strategy demonstrates the same loss of session result precision in both candidates.

## Non goals

This comparison does not choose final session credentials, lifecycle capabilities, transports, OIDC operations, or strategy implementation behavior. OTP, passkey, OIDC, and custom namespaces are inert type fixtures.

## Exit

Neither construction form is ready to replace the active usage API until one reusable strategy contract survives the remaining workflow proofs. After that boundary is settled and one construction form wins, the shared open strategy model and the winning syntax replace the fixed composition section of the active usage API. This directory is then removed rather than becoming another permanent contract.

## Reusable strategy follow up

[`reusable-strategy/`](./reusable-strategy/) compares namespace factories, operation descriptors, an explicit `defineStrategy` type encoding, and one universal session result. Namespace factories are the current runtime leader because they preserve distinct session and configuration types through a complete assertion free builder. Two OTP instances and two Google OIDC instances coexist under arbitrary caller chosen names. Operation descriptors retain the simpler data shape but need an unchecked generic projector. Complete passkey and OIDC workflow pressure tests remain before this finding can change the active usage contract.
