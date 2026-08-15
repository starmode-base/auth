IMPORTANT: THIS IS A LOOSE SPEC THAT WE _SHOULD_ CHANGE AS WE IMPLEMENT AND FIND BETTER PATTERNS

# ΛUTH

The LLM-friendly auth library. Auth that AI can set up in one prompt.

Passkeys + OTP as composable primitives. Apps choose their flow.

## Current API direction

> **Decided 2026-07-26:** The active usage model is specified in
> `packages/auth/src/spike/usage-api/`. It supersedes the older pure-primitive,
> application-orchestrated flow decisions that remain below as history.

The main spike contract still contains the earlier fixed session surface while the replacement boundary is being designed. For builder and session work, read the usage API README together with `packages/auth/src/spike/session-lifecycle/README.md`. Those documents record the active candidate and its open questions until the surviving types are promoted into the main spike contract.

`makeAuth` is a small authentication kernel configured by literal objects.
Sessions are mandatory. Chained OTP and passkey objects are complete trusted
authentication strategies: they own their feature-specific workflows, while
core owns builder composition, session establishment after successful
authentication, and current-user scoping for auth-resource management.

### Microkernel boundary

> **Clarified 2026-07-27:** This is a microkernel architecture, with one
> important qualification: “feature logic lives in DI” does not mean the
> kernel is logic-free. Injected modules own feature and mechanism logic; the
> kernel retains the small shared control plane.

The trust boundary is:

```text
strategy: prove and resolve an application user
    ↓
kernel: convert that successful result into a session
    ↓
session DI: implement that session
```

The kernel guarantees only what it controls:

- A failed authentication result creates no session.
- A successful result creates a session for exactly the userId returned by the
  strategy, using the one session implementation configured in `makeAuth`.
- Strategies do not receive the session implementation and cannot create
  sessions themselves.
- Auth-resource operations derive userId from the current session; their public
  methods never accept an arbitrary userId.
- Installed strategies hide direct session creation from the normal public
  usage surface.

The strategy remains a trusted authentication authority. A bespoke OTP strategy
can return an arbitrary user without verifying an OTP; core cannot detect that
lie. Directly implementing the strategy contract therefore replaces that
authentication engine. Core’s guarantee begins at the strategy result: it
controls how an authenticated identity becomes a session, not whether the
strategy proved that identity correctly.

This separation applies least authority. OTP and passkey strategies can
authenticate but cannot issue sessions; the session DI can issue sessions but
does not decide whether OTP or passkey proof succeeded; the kernel alone
connects those capabilities. Giving every strategy the session DI would make
each strategy reimplement the shared transition and would prevent the library
from guaranteeing consistent session behavior.

The admission test for kernel logic is strict:

> Core owns only behavior that every session-establishing strategy or
> current-user auth-resource operation must obey identically.

OTP generation and delivery, WebAuthn verification, challenges, credential
counters, identity binding, and feature policy remain outside the kernel. If
strategy-specific branches begin accumulating in core, the microkernel boundary
has been violated. Moving the shared transition into another file or helper
would not change its architectural ownership; the component with sole control
of that transition is the kernel.

Literal objects are the contract. A one-off implementation may be written
inline, a fixed reusable implementation is a preconfigured vanilla object, and
a parameterized reusable implementation may be produced by a `make*` helper.
Object-producing helpers add no capability; they only package construction or
retain supplied configuration. Lower-level primitives remain independently
importable and can be used to implement the same strategy contracts.

A DI operation exists only where core needs an independent decision point:
different public operations or requests, conditional invocation, a
cross-strategy security boundary, current-session authority, or an atomic
boundary. Mechanics that core would only run together belong behind one
semantic operation. Accordingly OTP exposes complete request and authenticate
strategy operations, passkey ceremony phases remain independent across
requests, and credential removal is one atomic strategy operation rather than
list followed by policy followed by delete.

Strategies normalize successful authentication to at least `{ userId }`.
Strategy-specific identity binding remains inside each strategy because OTP
identifier resolution, passkey credential identity, and future OAuth identity
resolution do not have the same inputs or authority. An operation that becomes
genuinely identical across strategies moves to `makeAuth`; it is never repeated
under every chained feature.

Session and passkey management lists return generic application-defined safe
projections extending stable identifiers. Core treats additional fields as
opaque and passes them through. Raw storage records, secrets, cryptographic
material, and internal policy state are never management projections.

## Core philosophy

- **Primitives-first** — core API is low-level primitives, flows are composed on top
- **Library-first** — your database is the source of truth, with an optional hosted service
- **User owns the database** — the library doesn't care: storage adapters map exchange shapes to your schema; no dictated tables, indexes, or drivers (decided 2026-07-17)
- **LLM-friendly** — no DNS config, no OAuth dashboards, no external clicks required
- **Explicit over implicit** — no magic defaults, everything is a visible import
- **Semantic contracts** — adapter interfaces state meaning (`verify`), never mechanism (`take`), so core stays frozen while implementations evolve freely
- **Nano scope** — intentionally small, won't grow into Auth0
- **Zero dependencies** — no runtime dependencies, peer dependencies only where unavoidable
- **Strong typings** — no type assertions (`as`), full type inference from API design
- **All fields required** — no optional parameters and no defaults, anywhere (decided 2026-07-17). Noisier but more distinct; explicit beats convenient. Optionals/defaults may be reconsidered later, not now.

### Inverted architecture

Traditional auth providers (Auth0, Clerk) own your user data. Your app syncs _from_ them. Their dashboard is the source of truth, and you're dependent on their uptime, their data model, their migration path.

**We flip this.** Your app database owns the users. The optional hosted service syncs _from_ you—like an analytics layer, not a dependency. Think Intercom or Mixpanel: useful dashboards and insights, but your app works fine without them.

If you want non-technical team members to manage users, you can optionally wire up mutation endpoints (delete user, disable account, etc.) that the dashboard calls on your behalf. Your app stays the source of truth—the dashboard is just a UI.

This means:

- **No vendor lock-in** — switch or self-host anytime, your data never leaves
- **No auth-service outages** — your auth works even if our dashboard is down
- **No sync bugs** — one source of truth eliminates the "which user record is correct?" problem

## Auth model

**Primitives-first.** OTP and passkeys are separate concerns. Apps compose flows.

| Concept                   | Purpose                |
| ------------------------- | ---------------------- |
| **Authentication**        | Create sessions        |
| **Identity verification** | Prove handle ownership |
| **Identity handle**       | User identifier        |

| Method                       | Authentication | Identity verification | Identity handle |
| ---------------------------- | -------------- | --------------------- | --------------- |
| ★ **Passkey**                | ✅             | ❌                    |                 |
| ★ **OTP (for auth)**         | ✅             | ✅                    | Email/phone     |
| ★ **OTP (for verification)** | ❌             | ✅                    | Email/phone     |
| **Username+password**        | ✅             | ❌                    | Username        |
| **Email+password**           | ✅             | ✅                    | Email           |
| **Passport verification**    | ❌             | ✅                    | Name            |

★ This library provides **Passkey** (authentication) and **OTP** (identity verification, optionally authentication).

These are independent primitives. Apps decide how to combine them:

| Flow                        | Description                                                                 | Use case                                                        |
| --------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Passkeys only**           | Passkey sign-up and sign-in, no OTP                                         | Anonymous/pseudonymous apps, maximum privacy                    |
| **OTP only**                | OTP sign-up and sign-in, no passkeys                                        | Simple apps, Clerk-like DX                                      |
| **Passkey → OTP**           | Passkey first, OTP to collect email later                                   | Privacy-first, email optional for communication                 |
| **OTP → Passkey**           | OTP to verify email, then passkey (current default)                         | Most apps — verified email + passkey auth                       |
| **OTP → Passkey (strict)**  | OTP for initial sign-up only, passkey-only after                            | High security — no OTP backdoor for existing users              |
| **OTP while authenticated** | Verify a new email/phone, or step-up before a sensitive action              | Add/change contact info, sudo mode                              |
| **Bring your own**          | Session core only — app verifies by its own means, then creates the session | Invite tokens, recovery codes, SSO assertions, guest-first apps |

The library provides primitives. Your app composes the flow that fits your security/UX tradeoffs.

### Primitives

See `CoreMethods`, `OtpMethods`, `PasskeyMethods`, and `AuthClient` types in `packages/auth/src/types.ts` for the complete API with JSDoc documentation.

| Primitive                                               | What it does                          | Client |
| ------------------------------------------------------- | ------------------------------------- | ------ |
| `createSession({ userId })`                             | Create session for user               | ❌     |
| `requestOtp({ identifier })`                            | Send OTP to identifier (email/phone)  | ✅     |
| `verifyOtp({ identifier, otp })`                        | Verify OTP → `{ success }`            | ✅     |
| `createRegistrationToken({ userId, identifier })`       | Create registration token             | ❌     |
| `validateRegistrationToken({ token })`                  | Validate → `{ userId, identifier }`   | ❌     |
| `generateRegistrationOptions({ registrationToken })`    | WebAuthn registration options         | ✅     |
| `verifyRegistration({ registrationToken, credential })` | Verify + store passkey → `{ userId }` | ✅     |
| `generateAuthenticationOptions()`                       | WebAuthn sign-in options              | ✅     |
| `verifyAuthentication({ credential })`                  | Verify passkey → `{ userId }`         | ✅     |
| `getSession()`                                          | Get session data                      | ❌     |
| `signOut()`                                             | End session                           | ✅     |
| `signOutAll()`                                          | End all sessions for user             | ❌     |

**Client column:** ✅ = exposed via `makeAuthClient` / callable from browser. ❌ = server-side only.

**Key design:** Verification never creates sessions. `verifyOtp`, `verifyRegistration`, and `verifyAuthentication` only prove facts and return the verified `userId` — apps create sessions explicitly via `createSession`. One rule, no exceptions.

> **Decided (2026-07-17): Pure verification.** Previously `verifyRegistration`/`verifyAuthentication` created sessions implicitly. Removed: core produces verified facts; a session is policy, and policy lives in userland — passkey sign-in is verify then `createSession`, identical in shape to the otp flow. The uniform rule unlocks zero-feature composition (multi-factor, step-up, custom flows need no library support) and fails closed (forgetting the session call yields no session). Consequences: (1) a browser-only REST flow can't complete sign-in — composing verify + createSession requires an app server function, which sharpens the open question about `makeAuthHandler`'s role; (2) the app now binds the verified userId to the session — examples must always thread the verify result's `userId` into `createSession` (see branded verified ids under Future).

> **Decided (2026-07-17): Return-type model — commands, queries, throws.** Commands return `Result<T, E>` with a per-method error union: expected failures (wrong otp, bad token, malformed client input) are values the caller branches on, and `E = never` collapses the type to an always-success envelope so methods without failure modes carry no dead error branch. Queries return the value or `null` — absence is not failure. Adapter interfaces return plain values/null — the envelope is how the library speaks, not how it listens. Infrastructure failures throw everywhere: they are breakage, not outcomes — throws feed the error monitor (and the wire layers convert them to `internal_error` envelopes), Results feed the user. Rationale: signatures must teach callers exactly what to handle — a `Result` that cannot fail teaches dead branches, a thrown expected failure forces try/catch as flow control (rejected; cf. tRPC client ergonomics), and catch-all Result wrapping shadows infrastructure errors into user-facing paths (the Zod `safeParse` split, applied consistently). Evolution: a method gaining a failure mode widens its `E` without changing shape. Replaces the earlier blanket rule "all public API functions return Result and never throw."

### Flows

The library provides primitives. Apps compose flows. Below are common patterns. In the diagrams, `session` at the end of a chain is an explicit `createSession` call by your app — nothing creates sessions implicitly.

**Passkeys only** (no OTP):

```
Sign up:    [app: createUser] → createRegistrationToken → passkey → session
Sign in:    passkey → session
```

Fastest sign-up — one click, no inbox. Email is optional, collected later if needed. Note: passkey-only has no built-in defense against mass account creation — passkeys are privacy-preserving by design (no shared device identifier, no way to correlate accounts). If abuse matters, an identity layer provides the scarcity: verified email, verified phone, payment, or invite. The `verify` primitive doubles as the abuse gate.

**OTP → Passkey** (default pattern):

```
Sign up:         requestOtp → verifyOtp → [app: upsertUser] → createRegistrationToken → passkey → session
Sign in:         passkey → session
New device:      requestOtp → verifyOtp → [app: lookupUser] → createRegistrationToken → passkey → session
Add passkey:     getSession → createRegistrationToken → passkey
Add/change email: getSession → requestOtp → verifyOtp → [app: storeEmail]
```

**OTP → Passkey (strict)** — disable OTP for existing users:

```
Sign up:     requestOtp → verifyOtp → [app: createUser] → createRegistrationToken → passkey → session
Sign in:     passkey → session
New device:  passkey (syncs via iCloud/Google/1Password) — or QR cross-device auth
```

In strict mode, once a user has passkeys, OTP is disabled for their account. This eliminates OTP as a perpetual backdoor. Lost all passkeys = contact support (rare, since passkeys sync).

**Passkey → OTP** (email optional):

```
Sign up:     [app: createUser] → createRegistrationToken → passkey → session
Add email:   getSession → requestOtp → verifyOtp → [app: storeEmail]
```

User creates account with just a passkey. Email is collected later (optional, for communication).

**OTP only** (no passkeys):

```
Sign up:    requestOtp → verifyOtp → [app: upsertUser] → createSession → session
Sign in:    requestOtp → verifyOtp → [app: lookupUser] → createSession → session
```

Simplest flow — email is both identity and auth. No passkeys, no registration tokens. See `examples/tanstack-start-react/otp-memory/` for a working implementation.

### Flow details

Below shows where each call runs — `authClient.` runs in the browser, `auth.` runs on your server.

**Sign up with OTP → passkey:**

1. Client: `authClient.requestOtp({ identifier })` — sends OTP
2. User receives OTP via email/phone
3. User submits OTP to app
4. Client: `signUp({ identifier, otp })` — your server function:
   - `auth.verifyOtp({ identifier, otp })` — validates OTP
   - App creates/gets user → `userId`
   - `auth.createRegistrationToken({ userId, identifier })` → `registrationToken`
5. Client: `authClient.generateRegistrationOptions({ registrationToken })`
6. Client: `authClient.createPasskey(options)` — browser WebAuthn
7. Client: `authClient.verifyRegistration({ registrationToken, credential })`
   - Server stores passkey, creates session → user authenticated

**Sign up with passkey only:**

1. Client: `signUp()` — your server function:
   - App creates user → `userId`
   - `auth.createRegistrationToken({ userId })` → `registrationToken`
2. Client: `authClient.generateRegistrationOptions({ registrationToken })`
3. Client: `authClient.createPasskey(options)` — browser WebAuthn
4. Client: `authClient.verifyRegistration({ registrationToken, credential })`
   - Server stores passkey, creates session → user authenticated

**Sign in** (passkey):

1. Client: `authClient.generateAuthenticationOptions()`
2. Client: `authClient.getPasskey(options)` — browser WebAuthn
3. Client: `authClient.verifyAuthentication({ credential })`
   - Server verifies signature, creates session → user authenticated

**Sign out:**

1. Client: `authClient.signOut()` — deletes session, clears cookie

**Add passkey** (while authenticated):

1. Client: `addPasskey({ identifier })` — your server function:
   - `auth.getSession()` → `userId`
   - `auth.createRegistrationToken({ userId, identifier })` → `registrationToken`
2. Client: `authClient.generateRegistrationOptions({ registrationToken })`
3. Client: `authClient.createPasskey(options)` — browser WebAuthn
4. Client: `authClient.verifyRegistration({ registrationToken, credential })`

**Add/change email** (while authenticated):

1. Client: `authClient.requestOtp({ identifier: newEmail })` — sends OTP to new email
2. User receives OTP
3. Client: `verifyEmail({ identifier: newEmail, otp })` — your server function:
   - `auth.getSession()` → `userId`
   - `auth.verifyOtp({ identifier: newEmail, otp })` — validates OTP
   - App stores verified email for user

**New device (OTP flow):**

Same as sign up, but your server function looks up the existing user instead of creating one. Note: this isn't "recovery" — passkeys sync across devices in most cases (iCloud, Google, 1Password). OTP is a fallback for cross-ecosystem scenarios.

**New device (strict mode):**

If OTP is disabled for existing users, use QR cross-device auth (WebAuthn hybrid transport) or ensure passkeys sync via a cross-platform provider like 1Password.

See `examples/tanstack-start/` for a working implementation.

### E2EE compatibility

For apps using WebAuthn PRF for key derivation (E2EE):

- Library exposes PRF extension results from passkey operations
- App derives KEK from PRF, manages DEK encryption
- Each passkey has unique PRF → unique KEK
- Adding passkey while authenticated: decrypt DEK with old KEK, re-encrypt with new KEK
- OTP → new passkey (without existing passkey): new PRF, can't decrypt old data → fresh start

**E2EE vs regular apps:**

| App type    | Auth          | Identity/verification   | Why                                                              |
| ----------- | ------------- | ----------------------- | ---------------------------------------------------------------- |
| **E2EE**    | Passkey only  | OTP verify (no session) | OTP can't derive KEK — an OTP session without the key is useless |
| **Regular** | Passkey + OTP | OTP does both           | Convenience — either method works on any device                  |

For E2EE, use **passkey → OTP** or **OTP → passkey (strict)** patterns:

- Passkey = authentication and key derivation
- OTP = identity verification only, never auth (or disabled entirely after setup)
- Lost all passkeys = lost data (the E2EE security contract)

**Adding passkey on new device (E2EE):**

1. Authenticate with existing passkey (QR cross-device or synced passkey)
2. Create new passkey → new PRF → new KEK
3. Decrypt DEK with old KEK, re-encrypt with new KEK
4. Both passkeys can now decrypt data

OTP cannot help here — it authenticates but doesn't provide the KEK needed to decrypt.

**Why passkey-first makes sense for E2EE:**

- Passkey IS the cryptographic identity
- Email is just contact info, not security-relevant
- Separating them is cleaner than mixing OTP into the key derivation story

Users should register multiple passkeys for redundancy. Each passkey can independently decrypt data (app encrypts DEK with each passkey's PRF-derived KEK).

## Architecture

Everything is explicit, never implicit. Config is grouped by feature (`session`, `otp`, `passkey`) — each group bundles its settings and storage adapter. You provide adapters (typed callbacks), the library orchestrates them.

### Adapter layering

> **Decided (2026-07-16):** Four layers, each with one rule. Users enter at any layer; each layer produces the input type of the layer above.

| Layer      | What it is                                  | Rule                                                                     | Examples                                                                               |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Contracts  | The adapter interfaces — the product        | Semantic, never mechanical; core runs on anything satisfying them        | `OtpStorage`, `SessionCodec`, `SessionTransportAdapter`                                |
| Mechanisms | Logic shipped as adapters, environment-free | No framework imports, ever                                               | `sessionTransportCookie`, `makeHmacCodec`, memory storages, `makeOtpStorage` (planned) |
| Bindings   | Environment glue                            | Zero logic — an if-statement means the logic moves down into a mechanism | `sessionTransportTanstack`, `sessionTransportNextjs`                                   |
| Configs    | Pre-composed config values                  | Data only — composition plus literals, no functions of their own         | `sessionCookieDefaults`; planned bundles like `placeholderOtp`                         |

### Framework-agnostic by design

| Layer             | What it does                      | Framework-specific? |
| ----------------- | --------------------------------- | ------------------- |
| `makeAuth`        | Session core, strategies chain on | No                  |
| `.withOtp()`      | Adds OTP methods                  | No                  |
| `.withPasskey()`  | Adds passkey methods              | No                  |
| `makeAuthHandler` | REST handler for auth API         | No                  |
| `makeAuthClient`  | Client (HTTP + WebAuthn)          | No                  |

One entry point, builder-style: `makeAuth(session).withOtp(otp).withPasskey(passkey)`. Every step returns a complete, usable auth object. `makeAuthHandler` and `makeAuthClient` are optional — apps can call primitives directly via server functions.

> **Decided (2026-07-16):** One factory, builder pattern — replaces the earlier three factories (`makeOtpAuth`, `makePasskeyAuth`, `makeAuth(full)`). Rationale: each chained step takes a concrete config type, so TypeScript enforces exact configs (excess keys rejected, invalid combos unrepresentable, duplicate `.withOtp()` a type error) while the result type only carries the methods that were configured. A single options-object factory can't do this without generics that wreck error messages; mutation-based config (class setters) can't be typed at all. Same progressive-inference pattern as TanStack Start server functions and tRPC. See `packages/auth/README.md` for the API.

The library provides a REST-based architecture. Server exposes `makeAuthHandler`, client uses `makeAuthClient`. Session management uses cookies automatically.

### Server module (`@starmode/auth`)

See `examples/tanstack-start/src/lib/auth.ts` for a working example. Config types (`OtpAuthConfig`, `PasskeyAuthConfig`, `FullAuthConfig`) and all storage/adapter types are documented in `packages/auth/src/types.ts`.

**Custom storage adapters:**

Storage is split by concern: `OtpStorage`, `SessionStorage`, `CredentialStorage`. Each factory only requires the storage types it uses. See `packages/auth/src/types.ts` — they're self-documenting.

> **Decided (2026-07-16): Semantic contracts, frozen core.** `OtpStorage.verify` stays the contract — it states meaning ("is this valid"), never mechanism. This keeps core frozen (policy changes are adapter releases, not core majors) and keeps the contract maximally general: delegated verification (e.g. Twilio Verify, where the provider checks the otp and no local record exists) is a valid adapter. Power lives at the edges; core hardly ever changes.

> **Decided (2026-07-16, corrected 2026-07-29): Mechanisms implement and test the common case once.** `makeOtpStorage({ store, take })` returns an `OtpStorage` with expiry checks, comparison, and one-time consumption implemented and race-tested by us. `take(identifier)` must be an atomic fetch-and-delete (`DELETE … RETURNING`, `GETDEL`); database recipes show how to satisfy that obligation. Power users may implement `OtpStorage` directly for delegated verification, custom lockouts, or other policies, but that implementation is application code and must satisfy the documented contract. Core trusts adapter results and cannot make an incorrect custom adapter safe. Conformance tests cover the shipped mechanism and document observable adapter behavior: sequential consumption plus deterministic barrier-based race checks — no hammering (see https://www.lirbank.com/harnessing-postgres-race-conditions.md).

> **Decided (2026-07-17): User owns the database; the API is request-scoped.** The library never dictates schema — record types (`SessionRecord`, `OtpRecord`, `CredentialRecord`) are exchange shapes at the adapter boundary, mapped to and from the user's own representation; reads must return records equivalent to what writes received, nothing more. Two placement rules follow. A namespace method exists only for request-scoped protocol operations — state named by the token riding the current request: `session.end` stays because only the library can name "the current session" and the transport pair is its own (create sets the cookie, end clears it). An adapter method exists only where core calls it during a protocol operation. Everything identifier-keyed — sign out everywhere, list sessions, revoke one session, remove a passkey — is plain CRUD on tables the user owns, done storage-direct, and deletion converges within the codec ttl on every token format (immediately with opaque). Accordingly `session.endAll`, `SessionStorage.deleteAll`, and `CredentialStorage.delete` are cut — superseding the shipped `signOutAll`/`deleteAll` noted in the roadmap. The sessionId-keyed `deleteAll` also failed open: a missing current-session record made it a silent no-op exactly when compromise response matters. The README gets a management-recipes table at promotion; management surfaces on convenience adapters are a later layer's question, tabled.

> **Decided (2026-07-17): TTLs — unit policy on unit configs; mechanism TTLs in mechanism factories, never on the SPI.** Core stamps every record deadline (`expiresAt` on session, otp, and challenge records) from unit config (`MakeAuthConfig.ttl`, `WithOtpConfig.ttl`, `WithPasskeyConfig.challengeTtl`). Token TTLs are mechanism-private: only self-contained codecs have a revocation window, so the number lives in the codec factory (`sessionHmac({ secret, ttl })`) — `SessionCodec.ttl` is removed from the SPI, and an opaque user configures no dead knob; the registration-token window is likewise codec-private. `TokenStatus.expiresAt` is the storage-check deadline — the time after which the carried record must be checked against storage: self-contained tokens embed it, lookup codecs report now (per-decode trust, `expired` never true — the zero-length revocation window that is opaque's known trade-off). Encode's directive stays `token: { expiresAt: Date | null }`: null = mint a deadline from the codec's own TTL, a Date = preserve the supplied deadline — that null branch is the seam that keeps deadline policy inside the only component that has one. Pressure-tested against splitting the codec into self-contained and lookup interfaces: rejected — it forks core into two algorithms (variation belongs at the edges; core stays frozen) and closes the taxonomy to hybrids such as lookup-with-short-cache; if lookup boilerplate ever matters, `makeLookupCodec({ lookup })` is a mechanisms-layer wrapper and the contract never moves. Accepted cost: a delivery template rendering "expires in N minutes" duplicates the otp ttl (config + template) — policy stays off the SPI.

> **Decided (2026-07-16): One attempt per otp.** A wrong otp consumes it — the user starts over with a fresh request. No attempt budgets, no re-store logic; every failure path fails closed. The typo cost is one email round-trip; acceptable for v1, revisit only on observed user friction. Per-IP rate limiting stays with the app; per-identifier cooldown is mechanism-layer (decided 2026-07-17, below).

> **Decided (2026-07-17): Rate limiting splits by who holds the state.** A rate limit is a decision over state and is enforced where that state lives, atomically — or it isn't real. The library owns exactly one relevant state, the otp record, so it enforces exactly one limit: per-identifier issuance frequency. `OtpStorage.store` may refuse (returns `false`), `requestOtp` fails with `rate_limited` and sends nothing, and the cooldown knob lives on `makeOtpStorage` (required field, `0` = explicitly off), enforced by an atomic conditional-put `store` primitive — the same one-word obligation as `take`. Per-IP/volume/bot defense stays with the app (it holds the request); sender reputation stays with the sending service (it holds cross-app outcomes). Full vector map and deployment shapes: THREAT-MODEL.md. Supersedes the blanket "rate limiting (infrastructure-layer concern)" exclusion.

**Why no database drivers?**

Most auth libraries take a database pool and run queries internally. This means they control your schema, ID generation, and query patterns — and you fight them when it doesn't match your app.

We don't touch your database. You write the persistence functions using whatever ORM/driver you already use. The library is pure orchestration.

**Shipped adapters:**

Naming: simple adapters are `{variant}{Type}`, factories are `make{Variant}{Type}()`.

```
Storage:
✓ memoryOtpStorage()           — in-memory OTP persistence (dev/test)
✓ memorySessionStorage()       — in-memory session persistence (dev/test)
✓ memoryCredentialStorage()    — in-memory credential persistence (dev/test)

Codecs:
✓ sessionHmac()                — HMAC-signed session tokens (stateless)
✓ sessionOpaque()              — opaque session tokens (requires DB lookup)
✓ registrationHmac()           — HMAC-signed registration tokens
  (SessionCodec is a simple interface — use a JWT library if you prefer JWT)

OTP delivery:
✓ otpTransportConsole          — logs OTP to console (dev)

Session transport:
✓ sessionTransportCookie()     — generic cookie-based session transport
✓ sessionTransportHeader()     — header-based session transport
✓ sessionTransportMemory()     — in-memory (testing)
✓ sessionTransportTanstack()   — TanStack Start cookie transport (@starmode/auth/tanstack)
✓ sessionTransportNextjs()     — Next.js cookie transport (@starmode/auth/nextjs)

Handler:
✓ makeAuthHandler()            — REST handler for auth API

Client:
✓ makeAuthClient()             — unified client (HTTP + WebAuthn)
```

**Planned:**

```
○ Flow adapters               — makeSignUpFlow(), makeEmailChangeFlow() (compose primitives)
○ otpFormatBranded()          — branded OTP message format
○ otpSendResend()             — send via Resend API
○ otpSendSendgrid()           — send via SendGrid API
○ makePostgresAdapters(pool)  — PostgreSQL persistence adapters
```

**Race-safe user upsert:**

User management is app responsibility, but the sign-up flow has potential for race conditions: two tabs verify OTP for the same email simultaneously, both see "no user exists", both try to create. Database examples should demonstrate race-safe patterns (e.g., `ON CONFLICT` for PostgreSQL/SQLite, `ON DUPLICATE KEY` for MySQL).

### Client module (`@starmode/auth/client`)

See `AuthClient` type in `packages/auth/src/types.ts` for the full interface. The client combines:

- **HTTP mutations:** `requestOtp`, `verifyOtp`, `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`, `signOut`
- **Browser WebAuthn:** `createPasskey`, `getPasskey`

**Note:** `getSession` is server-only. Apps decide how to expose auth status to the client (e.g., SSR loader, server function).

### No events API

> **Decided (2026-07-16):** The library ships no hooks or events system (cf. NextAuth events callbacks, Better Auth hooks). Those exist because flow-owning libraries must ventilate their internals; this library's flows are composed in userland, so the app already stands wherever a hook would fire — holding the `Result` of the very call an event would describe. Intent events (`onSignUp`) are structurally impossible for core: sign-up vs sign-in is decided by the app's upsert (`isNew`), which core never sees. Mechanical events (`onSessionCreated`) are redundant: they would fire when you call a function you called. Placement rules: business analytics (Mixpanel etc.) goes at the userland composition point next to `isNew`; security telemetry (audit logs, failed-attempt alerts) goes in adapter or method decorators. One mapped exception: the optional REST handler bypasses userland — if interception is ever needed there, it becomes a `makeAuthHandler` option, never a core concept.

### Session management

**How it works:**

1. User authenticates via passkey (`verifyRegistration` or `verifyAuthentication`) or app calls `createSession` (e.g. after OTP verification)
2. Server creates session → stores in DB → encodes token → sets HttpOnly cookie
3. Browser automatically sends cookie with every request
4. Server decodes token → validates → returns userId or null

**Note:** OTP verification (`verifyOtp`) does not create a session — it only proves the user controls an identifier. Apps create sessions explicitly via `createSession` (a core primitive) or implicitly via passkey verification (`verifyRegistration`, `verifyAuthentication`).

**Token format via codec:**

- `sessionHmac({ secret, ttl })` — HMAC-signed JSON with `{ sessionId, sessionExp, userId, tokenExp }`. Stateless validation for non-expired tokens, validates against DB when `tokenExp` passes. Types use `Date` (wire format is ms). `sessionExp: null` = forever.
- `sessionOpaque()` — Opaque (random string). Always validates against DB.

**Cookie settings:** HttpOnly, SameSite=Lax, Secure (in production). Chrome caps cookie expiry at 400 days.

### TTLs and expiry

The auth system has five distinct TTLs, each serving a different purpose:

| TTL           | Config                         | Purpose                                      | Typical value                   | Sliding refresh |
| ------------- | ------------------------------ | -------------------------------------------- | ------------------------------- | --------------- |
| Token TTL     | `sessionHmac({ ttl })`         | Revocation window — how long before DB check | 10 min                          | No              |
| Session TTL   | `session: { ttl }`             | Inactivity timeout — when to sign out user   | 30 days or `Infinity` (forever) | Yes             |
| Cookie TTL    | `sessionCookieDefaults.maxAge` | Browser cookie lifetime — auto-deleted after | 400 days                        | Yes             |
| OTP TTL       | `otpTransportConsole({ ttl })` | OTP validity — how long to enter the otp     | 10 min                          | No              |
| Challenge TTL | `webAuthn: { challengeTtl }`   | WebAuthn challenge validity                  | 5 min                           | No              |

**Token TTL vs Session TTL:**

- **Token TTL** (short, fixed) — Defines DB check frequency. When token `tokenExp` passes, `getSession()` checks DB. This is the "revocation window" — how long until sign-out/revocation takes effect. Must NOT slide, or revocation breaks.
- **Session TTL** (long or forever) — When to sign out the user due to inactivity. Tracked as `sessionExp` in token (slides every request) and `expiresAt` in DB (updated on DB fallback). `Infinity` means forever.

**Sliding refresh:**

|                    | Slides? | Why                                                                                                                       |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| Token `tokenExp`   | No      | Must be fixed to guarantee DB checks every tokenTtl. Sliding would let active users avoid DB forever → revocation broken. |
| Token `sessionExp` | Yes     | Slides every request to keep active users signed in. Checked before `tokenExp`.                                           |
| DB `expiresAt`     | Yes     | Updated on DB fallback. Fallback value if token lost.                                                                     |
| Cookie `maxAge`    | Yes     | Server mints new cookie each response. Keeps cookie alive for active users.                                               |

**`getSession()` flow:**

1. **Token valid** (`tokenExp` not passed):
   - Check `sessionExp` — if expired → sign out (inactive too long)
   - Issue fresh token: same `tokenExp`, new `sessionExp`
   - Slide cookie `maxAge`
   - Return `{ userId }`
   - No DB check

2. **Token expired** (`tokenExp` passed), `sessionExp` valid:
   - DB check — does session exist? (revocation check)
   - If not → sign out
   - Issue fresh token: new `tokenExp`, new `sessionExp`
   - Update DB `expiresAt`
   - Slide cookie `maxAge`
   - Return `{ userId }`

3. **`sessionExp` expired** (regardless of `tokenExp`):
   - Sign out — user inactive too long

**Cookie TTL vs Session TTL:**

The cookie is just transport — session validity is DB-controlled. Cookie TTL only matters as a floor:

- Cookie expires before session → user loses valid session (bad UX, avoid this)
- Cookie lives longer than session → normal, session check returns null when expired
- `sessionTtl: Infinity` (forever) + 400-day cookie → inactive 400+ days loses cookie, must re-auth

Rule: Cookie TTL ≥ Session TTL. For forever sessions, sliding refresh keeps the cookie alive for active users.

**Browser cookie limits:**

| Browser | Max cookie expiry                                       |
| ------- | ------------------------------------------------------- |
| Chrome  | 400 days — anything longer is silently capped           |
| Firefox | No strict limit (multi-year works)                      |
| Safari  | Server-set HttpOnly: no limit. JS cookies: 7 days (ITP) |

Chrome's 400-day cap is the practical constraint. Setting longer values doesn't hurt but gets silently reduced. For truly permanent sessions (years of inactivity), you'd need localStorage — out of scope for this library.

**Sign-out behavior:**

1. User signs out → session deleted from DB
2. HMAC token still valid until Token TTL expires
3. Next `getSession()` after Token TTL → DB check → session gone → signed out

Use short Token TTL (5-10 min) or opaque tokens if fast revocation matters. For most apps, a small revocation window is acceptable.

**OTP and Challenge TTLs:**

- Short-lived by design (5-10 min)
- One-time use — deleted after verification
- No sliding refresh

**Fetching the viewer:**

This library handles auth — proving identity and managing sessions. Fetching the viewer is your responsibility:

```ts
// Your code — same pattern as fetching any other data
const viewer = await fetch("/api/me"); // your endpoint, your shape
const posts = await fetch("/api/posts");
```

The session cookie is sent automatically. Your `/api/me` endpoint validates the session, looks up the user, returns whatever shape you need.

**Why not `client.getViewer()`?**

- Viewer shape is app-specific (roles, org, avatar, permissions, etc.)
- It's just data fetching, not auth
- Cookie is automatic, no special handling needed
- Clean boundary: we do auth, you do app data

**Future expansion (if needed):**

We could add a `getViewer()` utility with optional client-side session decoding:

| Server            | Client                 | `getViewer()`          |
| ----------------- | ---------------------- | ---------------------- |
| `sessionHmac()`   | `sessionDecoderHmac()` | Instant (local decode) |
| `sessionOpaque()` | (none)                 | Server call            |

For now, we keep it minimal — auth only, viewer fetching is your responsibility.

### Framework examples

See `examples/tanstack-start/` for a full OTP → passkey example and `examples/tanstack-start-otp/` for OTP-only:

- `examples/tanstack-start/src/lib/auth.ts` — full auth setup (`makeAuth`)
- `examples/tanstack-start-otp/src/auth.ts` — OTP-only setup (`makeOtpAuth`)

### React hooks (`@repo/auth-react`)

See `examples/AGENTS.md` for the full conventions on hooks, UI atoms, and data fetching strategy per framework.

Only things that need reactive state (loading, error) or multi-step orchestration need a React hook. Everything else can call the auth methods directly.

**Core hooks** — encode correct auth flows, the publishable value:

- `usePasskeyRegistration()` — orchestrates 3-step WebAuthn registration ceremony (server start → browser createPasskey → server verify)
- `usePasskeyAuthentication()` — orchestrates 3-step WebAuthn authentication ceremony

OTP flow is simple enough to inline in examples (4 `useState` calls + 2 form handlers). Passkey ceremonies are not — they involve the browser credential API, try/catch, and 3-step async sequences.

**Example infrastructure** — keeps examples focused on auth logic, not styling:

- `useAsync()` — convenience hook for loading asynchronous data (app data, not auth — exists for DRY examples only)
- UI atoms: `Page`, `Button`, `Header`, `Input`, `EmailInput`, `OtpInput`, `Toolbar`, `Avatar`, `AuthLayout`
- `PasskeyList` — passkey management UI

**Data fetching strategy in examples:**

- Meta-frameworks (Next.js, TanStack Start): use framework-native patterns (server components, route loaders)
- Plain React (Bun): uses `useAsync` for client-side data loading

**Direct calls (no hook needed):**

```ts
// Simple one-shot calls — just call the methods
await authClient.signOut();
await authClient.requestOtp({ identifier: email });
```

**Note:** No `useViewer()` hook — that's app data, not auth. Use your framework's data fetching (server components, route loaders, React Query, SWR, etc.).

## Scope

**Primitives:**

- OTP: `requestOtp`, `verifyOtp`
- Registration token: `createRegistrationToken`, `validateRegistrationToken`
- Passkeys: `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`
- Session: `createSession` (server-only), `getSession` (server-only), `signOut` (client-callable), `signOutAll` (server-only)

**Adapters:**

- Storage: memory (dev), PostgreSQL (planned)
- Tokens: HMAC (session + registration), opaque (session)
- OTP delivery: console (dev), Resend (planned), SendGrid (planned)
- Session transport: cookie, header, memory (testing), TanStack, Next.js
- Flows: planned (apps compose primitives directly for now)

**Frameworks:**

- Server: Framework-agnostic functions
- Client: Vanilla JS core + React hooks
- Tested with: Next.js (App Router), TanStack Start, Bun

**Roadmap:**

_Next: combined OTP + passkey examples_

Build out combined flow examples. Examples validate the design and drive library improvements.

Example features:

- [x] Sign up (OTP-only)
- [x] Sign up (passkey-only)
- [x] Sign in (passkey)
- [x] Sign out
- [ ] Combined OTP → passkey flow
- [ ] Unified "continue with email" flow (handles new + existing users)
- [ ] Add passkey (while authenticated)
- [ ] Add/change email (OTP verification for new identifier)
- [ ] Sign out all devices
- [ ] Manage passkeys UI
- [ ] Manage sessions UI
- [ ] Strict mode demo (disable OTP for existing users)

Note: the legacy `examples/tmp/tanstack-start/` has working versions of several of these features (add passkey, add/change email, sign out all, manage passkeys) but uses older patterns. These should be ported to the current example structure.

Library additions (as needed):

- [ ] `allowCredentials` in `generateAuthenticationOptions()` — see design notes below
- [x] `identifier: string | null` in `createRegistrationToken()` — explicit null for passkey-only sign-up (nullable, not optional, per the no-optionals rule; decided 2026-07-17, spiked)
- [x] Session management: `signOutAll()` on core methods, `deleteAll()` on `SessionStorage`
- [x] Passkey management: `delete()` on `CredentialStorage` — apps call storage directly for list/delete

Suggested order:

1. Unified flow — "continue with email" that handles new/existing users with smart messaging. The app's upsert function returns `isNew` to distinguish sign-up from sign-in (for analytics, onboarding, etc.) — see `upsertUser` in `examples/tanstack-start/src/lib/auth.server.ts`
2. Add passkey — tests authenticated registration
3. Add/change email — demonstrates OTP for identity verification while authenticated
4. `allowCredentials` — better UX for sign-in when identifier is known
5. Session management (`getSessions`, `signOutAll`) — needs new primitives
6. Passkey management (`getPasskeys`, `deletePasskey`) — needs new primitives
7. Strict mode — demonstrate disabling OTP for existing users

### `allowCredentials` design notes

The `allowCredentials` field on `PublicKeyCredentialRequestOptions` tells the browser which credential IDs the server expects, limiting the passkey picker to only those passkeys.

**Currently:** `generateAuthenticationOptions()` leaves `allowCredentials` empty, which means "discoverable credential" — the browser picks from all passkeys matching the `rpId`. This works for the passkey-only flow because modern passkeys use `residentKey: "preferred"` and are discoverable by default.

**When it matters:**

- **Non-discoverable credentials** (e.g., security keys in non-resident mode): These _require_ `allowCredentials` because the authenticator can't enumerate stored credentials — the server must tell it which credential IDs to look for.
- **Identifier-first flows** ("enter email, then passkey"): The server looks up credential IDs by email, passes them as `allowCredentials`, and the browser only offers matching passkeys. This is the "continue with email" pattern from the OTP+passkey combined flow.
- **Shared device clarity**: When multiple people use the same device, filtering avoids showing all accounts in the passkey picker.

**When it doesn't matter:**

- On production domains, the browser already filters passkeys by `rpId` — users only see passkeys for your site. The "too many passkeys" problem is mostly a development issue on `localhost`.
- For discoverable passkeys (the default), the browser handles selection natively.

**API shape (planned):**

```
generateAuthenticationOptions()                          // current — discoverable, no filter
generateAuthenticationOptions({ userId })                // planned — filter by user's stored credentials
generateAuthenticationOptions({ allowCredentials })      // planned — explicit credential ID list
```

The `userId` variant would look up credentials via `CredentialStorage.get(userId)` and populate `allowCredentials` automatically. The explicit variant gives apps full control.

**Deferred until:** The combined OTP+passkey example with identifier-first flow, where the user enters their email before authenticating with a passkey.

_Later: Next.js example_

Port passkey example to Next.js App Router. Two framework examples prove the library is framework-agnostic.

_Future:_

- Example: SMS OTP example — demonstrate transport-agnostic design (Twilio, etc.)
- Feature: React Native support
- Feature: E2EE/PRF module — WebAuthn PRF for key derivation
- Feature: Recovery codes — generate/verify with KDF (80-bit entropy, e.g. `7KF3-M9PN-2XLT-8HVQ`). For regular apps: code → session. For E2EE: code → recovery key → unwrap DEK client-side, then create new passkey
- Feature: Cross-ecosystem add-device — QR code flow with ephemeral key exchange. Device A (signed in) displays QR, device B scans and creates passkey. For E2EE: securely transfers KEK so device A can wrap DEK for the new credential. Same flow works for regular apps (ignore the KEK)
- Feature: Branded verified ids — verification results return a branded `VerifiedUserId` that `createSession` prefers, making the verified-user-to-session binding type-enforced (closes the wrong-userId composition footgun where an app passes its own lookup's id instead of the verify result's). Deferred until evidence it's needed — no just-in-case abstractions.
- Feature: LLM rules — ship Cursor/AI rules with the package, like `bun init` generates
- Service: Hosted user dashboard
- Service: Email relay service — hosted OTP email sending so users don't need to set up Resend/SendGrid, DNS, SPF, etc. (workspace in this repo, deployed separately)
- Service: Hosted session storage (idea, 2026-07-17) — a plain `SessionStorage` adapter, HMAC codec only (storage is consulted only at token refresh, so latency amortizes and outages degrade in token-TTL windows). The line: the service may host library-owned state (sessions, otp records, challenges), never app-owned state (users) — the Clerk problem is sync direction, not hosting, and library-state references only `userId` strings, so there is nothing to sync. Fits OTP-shaped apps, which already depend on a remote sender at sign-in; passkey-only apps lose self-sufficiency and should stay local. Credentials are borderline — UIs list passkeys, so hosting them adds a remote query; per-concern adapters mean you can host sessions and keep credentials local

**Exclusions:**

- ❌ OAuth / social login
- ❌ Magic links — link preview bots and SMS OG card fetchers invalidate links before the user clicks, and the "which device gets signed in?" confusion (the device that clicked vs the device that initiated) creates poor UX. OTP is unambiguous: you sign in where you type the otp
- ❌ Password-based auth
- ❌ Legacy browser support
- ❌ SAML / SSO / enterprise features
- ❌ IP/volume rate limiting and bot defense — request-layer state the library never sees (app middleware, WAF, captcha). Per-identifier cooldown is in scope — see THREAT-MODEL.md

**Constraints:**

- TypeScript only (no JavaScript, no other languages)
- ESM only (no CommonJS)
- Web only (React Native is a future goal)

## Positioning

**@starmode/auth**: Passkeys + OTP as composable primitives. Your flow, your rules.

Do you want passkeys? Yes → use this. No → this isn't for you.

If you need OAuth, SAML, legacy browser support, or enterprise SSO—use Auth0, Clerk or Okta.

If you're building a new project and want passkey auth that an LLM can set up in one prompt, this is it.

### How we differ

The through-line: **flow ownership**. Flow-owning libraries (NextAuth, Better Auth) and hosted providers (Clerk, Auth0) execute the auth flow for you; here the library does the heavy lifting — credential verification, sessions, crypto — while the flow itself is a few readable calls in your own code. Most differences below are consequences of that one split.

1. **No events API, because nothing happens behind your back.** Hooks and events callbacks exist because a library that runs the flow for you must let your app back in. Our flow already lives in your code — you're standing wherever a hook would fire, holding the return value an event would describe. An entire subsystem deleted by architecture, not omitted.
2. **Analytics without approximation.** Sign-up vs sign-in intent is born in your upsert (`isNew`) — the only place that can know it. Event-based designs approximate intent; we don't have to.
3. **Your database is the source of truth.** Hosted providers own your users and you sync from them; schema-generating libraries dictate your tables. We never touch your users table — the library persists only its own four internal record types, through functions you write with your own ORM.
4. **No database drivers.** Incumbent adapters take a connection and run their queries against their schema — compatibility errors, forced indexes, migration coupling. We take typed functions you implement however you like.
5. **Frozen core via semantic contracts.** Interfaces state meaning (`verify`), not mechanism, so policy evolution ships as adapters and mechanisms — not core majors with migration guides.
6. **Misconfiguration is a type error.** Builder steps take exact concrete configs — no optional fields, no unknown keys, no runtime options validation. The invalid setup doesn't compile.
7. **Agent-native, not agent-adapted.** No OAuth dashboards, no DNS, no external clicks. Signature-as-spec interfaces, flows visible in app code where an agent reads and writes them, and a core small enough to audit in one sitting.
8. **Tested mechanisms, explicit trust boundary.** Shipped mechanisms are tested against their contracts. A custom adapter is application code: core trusts it, the documentation states its obligations, and its author is responsible for getting it right.

**Why passkey-first:**

With passwords, email was inseparable from auth — you needed it for resets, recovery, and as the login identifier itself. Passkeys break this coupling. Auth becomes cryptographic, and email becomes optional infrastructure: useful for identity verification, communication, and recovery, but no longer a prerequisite for creating an account or signing in.

OTP can be both auth and identity verification. Passkeys can only be auth. For regular apps, this makes OTP a complete fallback — lost your passkey? OTP verifies your identity, gives you a session, and you're back in. For E2EE apps, a session alone is worthless without the decryption keys that only passkeys (or recovery codes) can provide. This is why regular apps can freely use OTP as an auth fallback, while E2EE apps should treat passkeys as the sole authority.

**Primitives-first design:**

- Core API is low-level primitives (verify OTP, verify passkey, create token, etc.)
- OTP and passkey are separate concerns — apps decide how to combine them
- Supports multiple patterns: passkeys only, OTP only, OTP → passkey, passkey → OTP
- Apps choose their security/UX tradeoff (permissive vs strict OTP policy)
- Optional flow adapters for common patterns

**Security model:**

- Passkeys are phishing-resistant (bound to origin, cryptographic proof)
- OTP primarily verifies identity/email ownership; apps can use it for auth if desired
- Apps choose their security posture:
  - Permissive: OTP can create new passkeys anytime (convenient, OTP is perpetual backdoor)
  - Strict: OTP for initial sign-up only, passkey-only after (OTP backdoor closed)
- E2EE compatible — PRF extension passthrough for key derivation

**Note on OTP security:**

OTP is not more secure than passkeys — if an attacker compromises your inbox, they can use OTP to create a new passkey. The security benefit of passkeys is UX (no inbox check, faster) and phishing resistance (can't be phished like OTP). For maximum security, use strict mode (disable OTP for existing users).

**Device transitions:**

- Same ecosystem (Apple→Apple, Google→Google, 1Password→anywhere): passkeys sync automatically
- Cross ecosystem: QR cross-device auth, or OTP fallback (if enabled)
- Lost all passkeys: OTP fallback (if enabled), or contact support
- Passkeys are designed to sync — losing ALL passkeys is rare with modern providers

**For E2EE apps:**

- Passkey = keys (PRF → KEK)
- Lost passkeys = lost data (this is the security contract, not a bug)
- OTP cannot recover encrypted data — it just authenticates
- Encourage multiple passkeys for redundancy
