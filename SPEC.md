IMPORTANT: THIS IS A LOOSE SPEC THAT WE _SHOULD_ CHANGE AS WE IMPLEMENT AND FIND BETTER PATTERNS

# STΛR MODΞ ΛUTH

The LLM-friendly auth library. Auth that AI can set up in one prompt.

Passkeys first. OTP for bootstrap. That's it.

## Core philosophy

- **Primitives-first** — core API is low-level primitives, flows are composed on top
- **Library-first** — your database is the source of truth, with an optional hosted service
- **LLM-friendly** — no DNS config, no OAuth dashboards, no external clicks required
- **Explicit over implicit** — no magic defaults, everything is a visible import
- **Nano scope** — intentionally small, won't grow into Auth0
- **Zero dependencies** — no runtime dependencies, peer dependencies only where unavoidable
- **Strong typings** — no type assertions (`as`), full type inference from API design

### Inverted architecture

Traditional auth providers (Auth0, Clerk) own your user data. Your app syncs _from_ them. Their dashboard is the source of truth, and you're dependent on their uptime, their data model, their migration path.

**We flip this.** Your app database owns the users. The optional hosted service syncs _from_ you—like an analytics layer, not a dependency. Think Intercom or Mixpanel: useful dashboards and insights, but your app works fine without them.

If you want non-technical team members to manage users, you can optionally wire up mutation endpoints (delete user, disable account, etc.) that the dashboard calls on your behalf. Your app stays the source of truth—the dashboard is just a UI.

This means:

- **No vendor lock-in** — switch or self-host anytime, your data never leaves
- **No auth-service outages** — your auth works even if our dashboard is down
- **No sync bugs** — one source of truth eliminates the "which user record is correct?" problem

## Auth model

**Passkey-first.** The library provides primitives. Apps compose flows.

### Primitives

See `MakeAuthResult` and `AuthClient` types in `packages/auth/src/types.ts` for the complete API with JSDoc documentation.

| Primitive                                               | What it does                         | Client |
| ------------------------------------------------------- | ------------------------------------ | ------ |
| `requestOtp({ identifier })`                            | Send OTP to identifier (email/phone) | ✅     |
| `verifyOtp({ identifier, otp })`                        | Verify OTP → `{ success }`           | ✅     |
| `createRegistrationToken({ userId, identifier })`       | Create registration token            | ❌     |
| `validateRegistrationToken({ token })`                  | Validate → `{ userId, identifier }`  | ❌     |
| `generateRegistrationOptions({ registrationToken })`    | WebAuthn registration options        | ✅     |
| `verifyRegistration({ registrationToken, credential })` | Verify + store + session             | ✅     |
| `generateAuthenticationOptions()`                       | WebAuthn sign-in options             | ✅     |
| `verifyAuthentication({ credential })`                  | Verify + session                     | ✅     |
| `getSession()`                                          | Get session data                     | ❌     |
| `signOut()`                                             | End session                          | ✅     |

**Client column:** ✅ = exposed via `makeAuthClient` / callable from browser. ❌ = server-side only.

Key design: **OTP never creates a session.** Only webauthn create sessions. `verifyOtp` just verifies the otp — it doesn't upsert users or create tokens. Apps compose the flow they need.

### Flows

The library provides primitives. Apps compose flows.

```
Sign up:      requestOtp → verifyOtp → [app: upsertUser] → createRegistrationToken → passkey → session
Sign in:      passkey → session
Sign out:     signOut → delete session (HMAC/JWT tokens valid until TTL — use short TTLs if needed)
Add passkey:  getSession → createRegistrationToken → passkey
Recovery:     requestOtp → verifyOtp → [app: lookupUser] → createRegistrationToken → passkey → session
```

Below shows where each call runs — `authClient.` runs in the browser, `auth.` runs on your server, and app code (like `signUp()`) is your server function.

**Sign up** (OTP + passkey):

1. Client: `authClient.requestOtp({ identifier })` — sends OTP
2. User receives OTP via email/phone
3. User submits OTP to app
4. Client: `signUp({ identifier, otp })` — your server function:
   - `auth.verifyOtp({ identifier, otp })` — validates OTP
   - App upserts user → `userId`
   - `auth.createRegistrationToken({ userId, identifier })` → `registrationToken`
5. Client: `authClient.generateRegistrationOptions({ registrationToken })`
6. Client: `authClient.createPasskey(options)` — browser WebAuthn
7. Client: `authClient.verifyRegistration({ registrationToken, credential })`
   - Server stores passkey, creates session → user authenticated

**Sign in** (passkey only):

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

**Recovery** (lost all passkeys):

Same as sign up, but your server function looks up the existing user instead of creating one. For E2EE apps, recovery means losing access to encrypted data — that's the security contract.

See `examples/tanstack-start/` for a working implementation.

### E2EE compatibility

For apps using WebAuthn PRF for key derivation (E2EE):

- Library exposes PRF extension results from passkey operations
- App derives KEK from PRF, manages DEK encryption
- OTP recovery = fresh start (new passkey, new KEK, old data unrecoverable)
- This is the E2EE security contract, not a library limitation

Users should register multiple passkeys for redundancy. Each passkey can independently decrypt data (app encrypts DEK with each passkey's PRF-derived KEK).

## Architecture

Everything is explicit, never implicit. No nesting, no magic. You provide adapters (typed callbacks), the library orchestrates them.

### Framework-agnostic by design

| Layer             | What it does              | Framework-specific? |
| ----------------- | ------------------------- | ------------------- |
| `makeAuth`        | Server-side auth logic    | No                  |
| `makeAuthHandler` | REST handler for auth API | No                  |
| `makeAuthClient`  | Client (HTTP + WebAuthn)  | No                  |

The library provides a REST-based architecture. Server exposes `makeAuthHandler`, client uses `makeAuthClient`. Session management uses cookies automatically.

### Server module (`@starmode/auth`)

See `examples/tanstack-start/src/lib/auth.ts` for a working example. Config types are documented in `MakeAuthConfig` in `packages/auth/src/types.ts`.

**Custom storage adapters:**

See `StorageAdapter` type in `packages/auth/src/types.ts` — it's self-documenting.

**Why no database drivers?**

Most auth libraries take a database pool and run queries internally. This means they control your schema, ID generation, and query patterns — and you fight them when it doesn't match your app.

We don't touch your database. You write the persistence functions using whatever ORM/driver you already use. The library is pure orchestration.

**Shipped adapters:**

Naming: simple adapters are `{variant}{Type}`, factories are `make{Variant}{Type}()`.

```
Storage:
✓ storageMemory()              — in-memory persistence (dev/test)

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

### Session management

**How it works:**

1. User authenticates via passkey (OTP only gives a registration token, not a session)
2. Server creates session → stores in DB → encodes token → sets HttpOnly cookie
3. Browser automatically sends cookie with every request
4. Server decodes token → validates → returns userId or null

**Token format via codec:**

- `sessionHmac({ secret, ttl })` — HMAC-signed JSON with `{ sessionId, sessionExp, userId, tokenExp }`. Stateless validation for non-expired tokens, validates against DB when `tokenExp` passes. Types use `Date` (wire format is ms). `sessionExp: null` = forever.
- `sessionOpaque()` — Opaque (random string). Always validates against DB.

**Cookie settings:** HttpOnly, SameSite=Lax, Secure (in production).

### TTLs and expiry

The auth system has five distinct TTLs, each serving a different purpose:

| TTL           | Config                         | Purpose                                      | Typical value                   | Sliding refresh |
| ------------- | ------------------------------ | -------------------------------------------- | ------------------------------- | --------------- |
| Token TTL     | `sessionHmac({ ttl })`         | Revocation window — how long before DB check | 10 min                          | No              |
| Session TTL   | `makeAuth({ sessionTtl })`     | Inactivity timeout — when to sign out user   | 30 days or `Infinity` (forever) | Yes             |
| Cookie TTL    | `sessionCookieDefaults.maxAge` | Browser cookie lifetime — auto-deleted after | 400 days                        | Yes             |
| OTP TTL       | `otpTransportConsole({ ttl })` | OTP validity — how long to enter the code    | 10 min                          | No              |
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

See `examples/tanstack-start/` for a complete working example:

- `src/lib/auth.ts` — server-side auth setup
- `src/lib/auth.client.ts` — client setup
- `src/lib/auth.server.ts` — app-specific flows (signUp, getViewer)
- `src/routes/api.auth/route.ts` — REST handler
- `src/routes/index.tsx` — UI with full auth flow

### React hooks

Only things that need reactive state (loading, error) or depend on other hooks need a React hook. Everything else can call the auth methods directly.

**Hooks (manage async state):**

- `useOtpFlow()` — manages OTP request/verify with loading/error state
- `usePasskeyRegister()` — manages WebAuthn registration flow
- `usePasskeySignIn()` — manages WebAuthn authentication flow

**Direct calls (no hook needed):**

```ts
// Simple one-shot calls — just call the methods
await authClient.signOut();
await authClient.requestOtp({ identifier: email });
```

**Note:** No `useViewer()` hook — that's app data, not auth. Use your own data fetching (React Query, SWR, server components, etc.).

## Scope

**Primitives:**

- OTP: `requestOtp`, `verifyOtp`
- Registration token: `createRegistrationToken`, `validateRegistrationToken`
- Passkeys: `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`
- Session: `getSession` (server-only), `signOut` (client-callable)

**Adapters:**

- Storage: memory (dev), PostgreSQL (planned)
- Tokens: HMAC (session + registration), opaque (session)
- OTP delivery: console (dev), Resend (planned), SendGrid (planned)
- Session transport: cookie, header, memory (testing), TanStack
- Flows: planned (apps compose primitives directly for now)

**Frameworks:**

- Server: Framework-agnostic functions
- Client: Vanilla JS core + React hooks
- Tested with: Next.js (App Router), TanStack Start

**Roadmap:**

_Next: TanStack Start full example_

Build out the TanStack Start example as a reference app with common auth features. This drives library improvements — examples validate the design.

Example features:

- [x] Sign up
- [x] Sign in
- [x] Sign out
- [ ] Recovery flow (OTP → verify existing user → new passkey)
- [ ] Add passkey (while authenticated)
- [ ] Sign out all devices
- [ ] Manage passkeys UI
- [ ] Manage sessions UI
- [ ] Add/change email or phone (OTP verification for new identifiers)

Library additions (as needed):

- [ ] `allowCredentials` in `generateAuthenticationOptions()` — filter passkeys by identifier
- [ ] Flow adapters (`makeSignUpFlow`, `makeRecoveryFlow`) — reduce boilerplate
- [ ] Session management primitives (`getSessions`, `signOutAll`)
- [ ] Passkey management primitives (`getPasskeys`, `deletePasskey`)

Suggested order:

1. Recovery flow — tests library flexibility for different composition
2. Add passkey — tests authenticated registration
3. `allowCredentials` — better UX for sign-in when identifier is known
4. Session management (`getSessions`, `signOutAll`) — needs new primitives
5. Passkey management (`getPasskeys`, `deletePasskey`) — needs new primitives
6. Flow adapters — DX improvement, refactor sign-up/recovery to use them

_Later: Next.js example_

Port full example to Next.js App Router. Two framework examples prove the library is framework-agnostic.

_Future:_

- Example: SMS OTP example — demonstrate transport-agnostic design (Twilio, etc.)
- Feature: React Native support
- Feature: E2EE/PRF module — WebAuthn PRF for key derivation
- Feature: LLM rules — ship Cursor/AI rules with the package, like `bun init` generates
- Service: Hosted user dashboard
- Service: Email relay service — hosted OTP email sending so users don't need to set up Resend/SendGrid, DNS, SPF, etc. (workspace in this repo, deployed separately)

**Exclusions:**

- ❌ OAuth / social login
- ❌ Magic links
- ❌ Password-based auth
- ❌ Legacy browser support
- ❌ SAML / SSO / enterprise features
- ❌ Rate limiting (infrastructure-layer concern)

**Constraints:**

- TypeScript only (no JavaScript, no other languages)
- ESM only (no CommonJS)
- Web only (React Native is a future goal)

## Positioning

**@starmode/auth**: Passkeys first. OTP for bootstrap. Primitives you compose.

Do you want passkeys? Yes → use this. No → this isn't for you.

If you need OAuth, SAML, legacy browser support, or enterprise SSO—use Auth0, Clerk or Okta.

If you're building a new project and want passkey auth that an LLM can set up in one prompt, this is it.

**Primitives-first design:**

- Core API is low-level primitives (verify OTP, create token, etc.)
- Apps compose primitives into flows (signup, change email, add email, etc.)
- Optional flow adapters for common patterns
- Easy to contribute new adapters

**Security model:**

- Webauthn is the only sign-in method (phishing-resistant)
- OTP verifies email ownership (for signup, email change, recovery)
- No OTP sign-in — eliminates entire class of attacks
- E2EE compatible — PRF extension passthrough for key derivation

**Recovery:**

- Encourage users to register multiple passkeys
- OTP recovery is optional — apps choose whether to expose it
- For E2EE apps: losing all passkeys = losing data (that's the security contract)
