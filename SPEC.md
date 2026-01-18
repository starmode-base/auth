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

| Primitive                                     | What it does                         | Client |
| --------------------------------------------- | ------------------------------------ | ------ |
| `requestOtp(identifier)`                      | Send OTP to identifier (email/phone) | ✅     |
| `verifyOtp(identifier, otp)`                  | Verify OTP → `{ valid }`             | ✅     |
| `createRegistrationToken(userId, identifier)` | Create registration token            | ❌     |
| `validateRegistrationToken(token)`            | Validate → `{ userId, identifier }`  | ❌     |
| `generateRegistrationOptions(token)`          | WebAuthn registration options        | ✅     |
| `verifyRegistration(token, credential)`       | Verify + store + session             | ✅     |
| `generateAuthenticationOptions()`             | WebAuthn sign-in options             | ✅     |
| `verifyAuthentication(credential)`            | Verify + session                     | ✅     |
| `getSession()`                                | Get session data                     | ❌     |
| `signOut()`                                   | End session                          | ✅     |

**Client column:** ✅ = exposed via `makeAuthClient` / callable from browser. ❌ = server-side only.

Key design: **OTP never creates a session.** Only webauthn create sessions. `verifyOtp` just verifies the otp — it doesn't upsert users or create tokens. Apps compose the flow they need.

### Flows (composed from primitives)

```
Sign up:    verifyOtp → upsertUser (app) → createRegistrationToken → passkey → session
Sign in:    passkey → session
Recovery:   verifyOtp → upsertUser (app) → createRegistrationToken → passkey → session
Change email: verifyOtp → app updates user record
Add email:    verifyOtp → app adds email to user
```

The library provides primitives. The app orchestrates:

```ts
// Sign up — app composes the flow
await auth.requestOtp(identifier);

const { valid } = await auth.verifyOtp(identifier, otp);

if (valid) {
  const { userId } = await db.users.upsert({ email: identifier }); // App's DB
  const { registrationToken } = await auth.createRegistrationToken(
    userId,
    identifier,
  );
  // Continue with passkey registration...
}

// Change identifier — different flow, same primitives
await auth.requestOtp(newIdentifier);

const { valid } = await auth.verifyOtp(newIdentifier, otp);

if (valid) {
  await db.users.update(userId, { email: newIdentifier }); // App's DB
}
```

**OTP recovery is optional.** Apps choose whether to expose it:

- Regular apps: expose it — user recovers account and data
- E2EE apps: don't expose it — OTP can't recover encrypted data anyway

### Flow adapters (optional convenience)

For common patterns, we ship flow adapters that compose primitives:

```ts
import { makeSignUpFlow } from "@starmode/auth/flows";

const signUp = makeSignUpFlow({
  auth,
  upsertUser: async (identifier) => db.users.upsert({ email: identifier }),
});

// Usage — one call instead of multiple
const { registrationToken } = await signUp(identifier, otp);
```

Flow adapters are optional. You can always use primitives directly.

### Server-side flows (implementation detail)

```
OTP verification:
1. User submits identifier (email or phone)
2. Server stores OTP, sends via configured channel
3. User submits OTP
4. Server verifies OTP (checks OTP table)
5. Server returns true
   ← app decides what to do next →

Sign up (app orchestrates):
1. App calls verifyOtp → valid
2. App upserts user → userId
3. App calls createRegistrationToken(userId, identifier)
4. Continue with passkey registration...

Passkey registration:
1. Client has registration token
2. Client calls generateRegistrationOptions(registrationToken)
3. Server validates token, generates WebAuthn challenge
4. Client triggers browser WebAuthn (create credential)
5. Client calls verifyRegistration(registrationToken, credential)
6. Server stores credential (linked to userId from token)
7. Server inserts session
8. Server returns session cookie
   ← user is now authenticated →

Passkey sign in:
1. Client requests authentication options
2. Server generates WebAuthn challenge
3. Client triggers browser WebAuthn (biometric prompt)
4. Client sends signed credential to server
5. Server looks up credential by ID → gets userId + public key
6. Server verifies signature
7. Server inserts session
8. Server returns session cookie
```

**Implementation notes:**

- Registration token is HMAC-signed containing userId + identifier, short TTL (5 min)
- `getCredentialById(credentialId)` adapter needed to look up userId during passkey auth
- User management is app responsibility — library doesn't touch users table

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

**Usage:**

```ts
import {
  makeAuth,
  makeCookieAuth,
  makeMemoryAdapters,
  makeSessionHmac,
  makeRegistrationHmac,
  otpSendConsole,
} from "@starmode/auth";

const auth = makeAuth({
  // All persistence adapters
  storage: makeMemoryAdapters(), // or your own adapters

  // Codecs (token encoding)
  session: makeSessionHmac({
    secret: process.env.SESSION_SECRET,
    ttl: 600, // 10 min
  }),
  registration: makeRegistrationHmac({
    secret: process.env.REGISTRATION_SECRET,
    ttl: 300, // 5 min
  }),

  // OTP delivery
  sendOtp: otpSendConsole,

  // Passkey config
  webauthn: {
    rpId: "example.com",
    rpName: "My App",
  },
});

// Wrap with cookie handling (you provide cookie ops)
const cookieAuth = makeCookieAuth({
  auth,
  cookie: {
    get: () => /* read session cookie */,
    set: (token) => /* set session cookie */,
    clear: () => /* clear session cookie */,
  },
});
```

**Custom storage adapters:**

See `StorageAdapter` type in `packages/auth/src/types.ts` for the full interface. Example:

```ts
const auth = makeAuth({
  storage: {
    otp: {
      store: async (identifier, otp, expiresAt) => {
        /* your ORM */
      },
      verify: async (identifier, otp) => {
        /* your ORM */
      },
    },
    session: {
      store: async (sessionId, userId, expiresAt) => {
        /* your ORM */
      },
      get: async (sessionId) => {
        /* your ORM */
      },
      delete: async (sessionId) => {
        /* your ORM */
      },
    },
    credential: {
      store: async (userId, credential) => {
        /* your ORM */
      },
      get: async (userId) => {
        /* your ORM */
      },
      getById: async (credentialId) => {
        /* your ORM */
      },
      updateCounter: async (credentialId, counter) => {
        /* your ORM */
      },
    },
  },
  // ... other config
});
```

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
✓ sessionTransportCookie()     — cookie-based session transport
✓ sessionTransportHeader()     — header-based session transport

Handler:
✓ makeAuthHandler()            — REST handler for auth API

Client:
✓ makeAuthClient()             — unified client (HTTP + WebAuthn)
```

**Flow adapters (`@starmode/auth/flows`):**

Optional convenience adapters that compose primitives for common patterns:

```
✓ makeSignUpFlow()           — verifyOtp + upsertUser + createRegistrationToken
○ makeEmailChangeFlow()      — verifyOtp + update user email callback
○ makeAddEmailFlow()         — verifyOtp + add email callback
```

**Planned:**

```
○ otpFormatBranded()         — branded OTP message format
○ otpSendResend()            — send via Resend API
○ otpSendSendgrid()          — send via SendGrid API
○ makePostgresAdapters(pool) — PostgreSQL persistence adapters
```

### Client module (`@starmode/auth/client`)

**Usage:**

```ts
import { makeAuthClient } from "@starmode/auth/client";

const authClient = makeAuthClient("/api/auth");

// Sign up flow
await authClient.requestOtp("user@example.com");
// signUp is app-specific (verifyOtp + upsertUser + createRegistrationToken)
const { registrationToken } = await signUp("user@example.com", "123456");

// Continue with passkey registration (unified API)
const { options } =
  await authClient.generateRegistrationOptions(registrationToken);
const credential = await authClient.createPasskey(options); // Browser WebAuthn
await authClient.verifyRegistration(registrationToken, credential);
// Now user has a session

// Sign in flow: passkey only (unified API)
const { options: authOptions } =
  await authClient.generateAuthenticationOptions();
const authCredential = await authClient.getPasskey(authOptions); // Browser WebAuthn
await authClient.verifyAuthentication(authCredential);
// Now user has a session

await authClient.signOut();
```

The client combines HTTP mutations with browser WebAuthn helpers:

- **HTTP mutations:** `requestOtp`, `verifyOtp`, `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`, `signOut`
- **Browser WebAuthn:** `createPasskey`, `getPasskey`

**Note:** `getSession` is server-only. Apps decide how to expose auth status to the client (e.g., SSR loader, `/api/me` endpoint).

See `AuthClient` type in `packages/auth/src/types.ts` for the full client interface.

### Session management

**How it works:**

1. User authenticates via passkey (OTP only gives a registration token, not a session)
2. Server creates session → stores in DB → encodes token → sets HttpOnly cookie
3. Browser automatically sends cookie with every request
4. Server decodes token → validates → returns userId or null

**Token format via codec:**

- `makeSessionHmac({ secret, ttl })` — HMAC-signed JSON. Stateless validation for non-expired tokens, validates against DB when expired.
- `makeSessionOpaque()` — Opaque (random string). Always validates against DB.

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

| Server                | Client                 | `getViewer()`          |
| --------------------- | ---------------------- | ---------------------- |
| `makeSessionHmac()`   | `sessionDecoderHmac()` | Instant (local decode) |
| `makeSessionOpaque()` | (none)                 | Server call            |

For now, we keep it minimal — auth only, viewer fetching is your responsibility.

### Framework examples

**Server setup (any framework):**

```ts
// lib/auth.ts
import {
  makeAuth,
  storageMemory,
  sessionHmac,
  registrationHmac,
  otpTransportConsole,
} from "@starmode/auth";
import { sessionTransportCookie } from "@starmode/auth/cookie";

export const auth = makeAuth({
  storage: storageMemory(),
  sessionCodec: sessionHmac({ secret: process.env.SESSION_SECRET!, ttl: 600 }),
  registrationCodec: registrationHmac({ secret: process.env.REG_SECRET!, ttl: 300 }),
  otpTransport: otpTransportConsole,
  sessionTransport: sessionTransportCookie({ ... }),
  webAuthn: { rpId: "example.com", rpName: "My App" },
});
```

**REST API route:**

Use `makeAuthHandler` to expose auth primitives via REST.

```ts
// api/auth/route.ts (Next.js)
import { makeAuthHandler } from "@starmode/auth";
import { auth } from "@/lib/auth";

const { POST } = makeAuthHandler(auth);
export { POST };
```

```ts
// routes/api.auth/route.ts (TanStack Start)
import { createFileRoute } from "@tanstack/react-router";
import { makeAuthHandler } from "@starmode/auth";
import { auth } from "~/lib/auth";

export const Route = createFileRoute("/api/auth")({
  server: { handlers: makeAuthHandler(auth) },
});
```

**Client usage:**

```ts
// lib/auth.client.ts
import { makeAuthClient } from "@starmode/auth/client";
export const authClient = makeAuthClient("/api/auth");
```

```tsx
// Component
import { authClient } from "@/lib/auth.client";

// Request OTP
await authClient.requestOtp(email);

// Passkey registration (unified API)
const { options } = await authClient.generateRegistrationOptions(token);
const credential = await authClient.createPasskey(options);
await authClient.verifyRegistration(token, credential);

// Passkey sign-in (unified API)
const { options } = await authClient.generateAuthenticationOptions();
const credential = await authClient.getPasskey(options);
await authClient.verifyAuthentication(credential);
```

**App-specific flows (server-side):**

The `signUp` flow is app-specific because it needs to upsert the user in your database.

```ts
// lib/auth.server.ts (TanStack Start)
import { createServerFn } from "@tanstack/react-start";
import { auth } from "./auth";

export const signUp = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const result = await auth.verifyOtp(data.identifier, data.otp);
    if (!result.success) return { success: false };

    const { userId } = await db.users.upsert({ email: data.identifier });
    return auth.createRegistrationToken(userId, data.identifier);
  },
);

// For SSR loaders that need session data
export const getSession = createServerFn({ method: "GET" }).handler(() =>
  auth.getSession(),
);
```

### React hooks

Only things that need reactive state (loading, error) or depend on other hooks need a React hook. Everything else can call the auth methods directly.

**Hooks (manage async state):**

- `useOtpFlow()` — manages OTP request/verify with loading/error state
- `usePasskeyRegister()` — manages WebAuthn registration flow
- `usePasskeySignIn()` — manages WebAuthn authentication flow

**Direct calls (no hook needed):**

```ts
// Simple one-shot calls — just call the methods
await signOut();
await requestOtp(email);
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
- Flows: `makeSignUpFlow` (optional convenience)

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
