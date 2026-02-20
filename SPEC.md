IMPORTANT: THIS IS A LOOSE SPEC THAT WE _SHOULD_ CHANGE AS WE IMPLEMENT AND FIND BETTER PATTERNS

# STΛR MODΞ ΛUTH

The LLM-friendly auth library. Auth that AI can set up in one prompt.

Passkeys + OTP as composable primitives. Apps choose their flow.

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

| Flow                       | Description                                           | Use case                                           |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| **Passkeys only**          | Passkey sign-up and sign-in, no OTP                   | Anonymous/pseudonymous apps, maximum privacy       |
| **OTP only**               | OTP sign-up and sign-in, no passkeys                  | Simple apps, Clerk-like DX                         |
| **Passkey → OTP**          | Passkey first, OTP to collect email later             | Privacy-first, email optional for communication    |
| **OTP → Passkey**          | OTP to verify email, then passkey (current default)   | Most apps — verified email + passkey auth          |
| **OTP → Passkey (strict)** | OTP for initial sign-up only, passkey-only after      | High security — no OTP backdoor for existing users |
| **OTP for email changes**  | Use OTP to verify new email/phone while authenticated | Common feature — add/change contact info           |

The library provides primitives. Your app composes the flow that fits your security/UX tradeoffs.

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

**Key design:** `verifyOtp` only verifies — it doesn't create sessions by default. Apps can create sessions after OTP verification if desired (OTP-only auth). `verifyRegistration` and `verifyAuthentication` create sessions. Apps compose the flow they need.

### Flows

The library provides primitives. Apps compose flows. Below are common patterns.

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

1. User authenticates via passkey (`verifyRegistration` or `verifyAuthentication`)
2. Server creates session → stores in DB → encodes token → sets HttpOnly cookie
3. Browser automatically sends cookie with every request
4. Server decodes token → validates → returns userId or null

**Note:** OTP verification (`verifyOtp`) does not create a session — it only proves the user controls an identifier. Sessions are only created by passkey verification.

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

- [x] Sign up (OTP → passkey)
- [x] Sign in (passkey)
- [x] Sign out
- [ ] Unified "continue with email" flow (handles new + existing users)
- [ ] Add passkey (while authenticated)
- [ ] Add/change email or phone (OTP verification for new identifiers)
- [ ] Sign out all devices
- [ ] Manage passkeys UI
- [ ] Manage sessions UI
- [ ] Strict mode demo (disable OTP for existing users)

Library additions (as needed):

- [ ] `allowCredentials` in `generateAuthenticationOptions()` — filter passkeys by identifier
- [ ] Make `identifier` optional in `createRegistrationToken()` — support passkey-only sign-up
- [ ] Session management primitives (`getSessions`, `signOutAll`)
- [ ] Passkey management primitives (`getPasskeys`, `deletePasskey`)

Suggested order:

1. Unified flow — "continue with email" that handles new/existing users with smart messaging
2. Add passkey — tests authenticated registration
3. Add/change email — demonstrates OTP for identity verification while authenticated
4. `allowCredentials` — better UX for sign-in when identifier is known
5. Session management (`getSessions`, `signOutAll`) — needs new primitives
6. Passkey management (`getPasskeys`, `deletePasskey`) — needs new primitives
7. Strict mode — demonstrate disabling OTP for existing users

_Later: Next.js example_

Port full example to Next.js App Router. Two framework examples prove the library is framework-agnostic.

_Future:_

- Example: SMS OTP example — demonstrate transport-agnostic design (Twilio, etc.)
- Feature: React Native support
- Feature: E2EE/PRF module — WebAuthn PRF for key derivation
- Feature: Recovery codes — generate/verify with KDF (80-bit entropy, e.g. `7KF3-M9PN-2XLT-8HVQ`). For regular apps: code → session. For E2EE: code → recovery key → unwrap DEK client-side, then create new passkey
- Feature: Cross-ecosystem add-device — QR code flow with ephemeral key exchange. Device A (signed in) displays QR, device B scans and creates passkey. For E2EE: securely transfers KEK so device A can wrap DEK for the new credential. Same flow works for regular apps (ignore the KEK)
- Feature: LLM rules — ship Cursor/AI rules with the package, like `bun init` generates
- Service: Hosted user dashboard
- Service: Email relay service — hosted OTP email sending so users don't need to set up Resend/SendGrid, DNS, SPF, etc. (workspace in this repo, deployed separately)

**Exclusions:**

- ❌ OAuth / social login
- ❌ Magic links — link preview bots and SMS OG card fetchers invalidate links before the user clicks, and the "which device gets signed in?" confusion (the device that clicked vs the device that initiated) creates poor UX. OTP is unambiguous: you sign in where you type the code
- ❌ Password-based auth
- ❌ Legacy browser support
- ❌ SAML / SSO / enterprise features
- ❌ Rate limiting (infrastructure-layer concern)

**Constraints:**

- TypeScript only (no JavaScript, no other languages)
- ESM only (no CommonJS)
- Web only (React Native is a future goal)

## Positioning

**@starmode/auth**: Passkeys + OTP as composable primitives. Your flow, your rules.

Do you want passkeys? Yes → use this. No → this isn't for you.

If you need OAuth, SAML, legacy browser support, or enterprise SSO—use Auth0, Clerk or Okta.

If you're building a new project and want passkey auth that an LLM can set up in one prompt, this is it.

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
