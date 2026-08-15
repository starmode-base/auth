# Usage API

> **Status:** Active API design spike. Names are provisional; the ownership, composition, and public workflow model are the subject of this experiment.

## Objective

Prove one small server API that is easy to wire into any framework while its configuration remains explicit, extensible, and independent of session, storage, token, and framework mechanisms.

## Mental model

`makeAuth` is a small authentication kernel.

- Literal objects are the DI contract.
- OTP and passkeys chained onto `makeAuth` are complete trusted authentication strategies.
- Strategy DIs own their feature workflows.
- Core owns composition, session establishment, and current-user scoping.
- Primitives remain independently importable.
- Object-producing helpers are optional compression over the literal contract.

The primary boundary is:

> Auth owns proofs, authentication workflows, and the lifecycle of authentication artifacts. The application owns users, identity data, and business consequences. DI lets auth invoke application-owned decisions without owning the application's data model.

A direct strategy implementation replaces that authentication engine and is therefore a trusted boundary. The normal implementation may be an object produced by library helpers, but `makeAuth` does not distinguish produced objects from inline ones.

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
- Session capabilities remain independent when the configured implementation exposes them because each is invoked by a distinct public or internal operation.

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

Session-only auth exposes session creation as the escape hatch for bespoke authentication. Once a shipped strategy is installed, that strategy returns an authenticated user to core and core creates the session. Applications retain the lookup, renewal, termination, and management capabilities exposed by the configured session implementation.

| Configuration          | Public session API                                                       |
| ---------------------- | ------------------------------------------------------------------------ |
| Sessions only          | Supported mechanism capabilities, including direct session creation      |
| Sessions plus OTP      | Supported mechanism capabilities, with session creation reserved to core |
| Sessions plus passkeys | Supported mechanism capabilities, with session creation reserved to core |
| Sessions plus both     | Supported mechanism capabilities, with session creation reserved to core |

Strategy configuration determines whether direct session creation is public. The configured session mechanism determines which lifecycle and management operations are meaningful; that second capability question remains under pressure testing.

The usage API exposes completed workflows:

```ts
auth.otp.request(...)
auth.otp.authenticate(...)
auth.passkey.createAuthenticationOptions(...)
auth.passkey.verifyAuthentication(...)
auth.session.end()
```

Normal authentication and auth-resource server functions should approach one call into `auth`. Application actions such as `getViewer` or `changeEmail` consume session state or independent proof primitives and remain application workflows.

## Session contract split

The kernel's internal session dependency and the public session API are separate contracts. The kernel needs a small stable way to establish a session and resolve the current identity. The public namespace exposes only capabilities that the configured session implementation genuinely supports. Operations such as refresh, listing, bulk termination, and revocation are capabilities, not universal requirements.

The session implementation may expose application-defined claims together with `userId`. Core requires only `userId`, preserves the inferred identity type where it crosses the public API, and treats all additional claims as opaque. OTP and passkey strategies neither define nor resolve session claims.

The exact minimal internal port and its TypeScript projection into a mechanism-dependent public namespace remain open. The current `SessionAdapter` is a candidate being reduced, not a settled universal interface.

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

Session and passkey lists return application-defined generic summary types. Core requires only `sessionId` or `credentialId` and passes additional fields through unchanged:

```ts
type SessionListItem = SessionSummary & {
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

The session-lifecycle spike explores session authority and access representations. Its mechanism findings remain useful, but its empty-builder composition model is superseded here.

Once this usage model survives pressure testing, its settled pieces replace the corresponding sections of the main spike contract. This directory is not intended to become a second permanent contract.
