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

- `sessionHmac({ secret, ttl })` — HMAC-signed JSON. Stateless validation for non-expired tokens, validates against DB when expired.
- `sessionOpaque()` — Opaque (random string). Always validates against DB.

**Cookie settings:** HttpOnly, SameSite=Lax, Secure (in production).

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

**Future:**

- Hosted user dashboard
- SMS OTP
- React Native support
- E2EE/PRF module — WebAuthn PRF for key derivation
- Session management utilities — `signOutAll()`, `getSessions()` (users can query DB directly for now)
- Passkey management utilities — `getPasskeys()`, `deletePasskey()` (users can query DB directly for now)
- Multi-email support — add/remove emails per user (not prevented now, users own their schema)
- LLM rules — ship Cursor/AI rules with the package, like `bun init` generates
- Email relay service — hosted OTP email sending so users don't need to set up Resend/SendGrid, DNS, SPF, etc. (separate project, `SendOtp` adapter ready)

**Exclusions:**

- ❌ OAuth / social login
- ❌ Magic links
- ❌ Password-based auth
- ❌ Legacy browser support
- ❌ SAML / SSO / enterprise features

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
