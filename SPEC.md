# STΛR MODΞ Auth

The LLM-friendly auth library. Auth that AI can set up in one prompt.

Passkeys + OTP. That's it.

## Core philosophy

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

Two primitives, each doing one job:

- **OTP** = email verification (sign up, recovery)
- **Passkey** = sign in (day-to-day authentication)

### Flows

```
Sign up:  email → OTP → verify → [authenticated] → register passkey → done
Sign in:  passkey → done
Recovery: email → OTP → verify → [authenticated] → register new passkey → done
```

Recovery is just sign-up again. Same flow.

**Server-side flows (implementation detail):**

```
OTP verification (sign up / recovery):
1. User submits email
2. Server stores OTP, sends email
3. User submits OTP
4. Server verifies OTP (checks OTP table)
5. Server upserts user (atomic) → userId
6. Server inserts session
7. Server returns session cookie
   ← user is now authenticated →

Passkey registration (after OTP, user is authenticated):
1. Client prompts "Set up passkey"
2. Client calls generateRegistrationOptions(userId)
3. Server generates WebAuthn challenge
4. Client triggers browser WebAuthn (create credential)
5. Client calls verifyRegistration(userId, credential)
6. Server stores credential (linked to userId)

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

Key difference:

- OTP: email → verify → upsert user → session (user might be new)
- Passkey registration: requires authenticated session (userId known)
- Passkey sign in: credential → verify → user already exists → session

**Implementation notes:**

- User upsert must be atomic (single query with `ON CONFLICT` or equivalent) — no separate get + create
- May need `getCredentialById(credentialId)` adapter to look up userId during passkey auth

## Architecture

Everything is explicit, never implicit. No nesting, no magic. You provide adapters (typed callbacks), the library orchestrates them.

### Framework-agnostic by design

| Layer            | What it does            | Framework-specific?         |
| ---------------- | ----------------------- | --------------------------- |
| `makeAuth`       | Pure auth logic         | No                          |
| `makeCookieAuth` | Wraps auth with cookies | No (you provide cookie ops) |
| `httpClient`     | HTTP client (fetch)     | No                          |

The only framework-specific code is the glue you write: cookie get/set/clear functions for `makeCookieAuth`. For server actions, you export the `cookieAuth` methods directly. For HTTP, you use `httpClient`.

### Server module (`@starmode/auth`)

**Usage:**

```ts
import {
  makeAuth,
  makeCookieAuth,
  otpEmailMinimal,
  otpSendConsole,
  makeSessionTokenJwt,
} from "@starmode/auth";

const auth = makeAuth({
  // OTP persistence
  storeOtp: async (email, code, expiresAt) => {
    /* your ORM */
  },
  verifyOtp: async (email, code) => {
    /* your ORM */
  },

  // User persistence (atomic upsert — no race conditions)
  upsertUser: async (email) => {
    /* your ORM */
  },

  // Passkey persistence
  storeCredential: async (userId, credential) => {
    /* your ORM */
  },
  getCredentials: async (userId) => {
    /* your ORM */
  },

  // Session persistence
  storeSession: async (sessionId, userId, expiresAt) => {
    /* your ORM */
  },
  getSession: async (sessionId) => {
    /* your ORM */
  },
  deleteSession: async (sessionId) => {
    /* your ORM */
  },

  // Session token (encode/decode are separate adapters, but tightly coupled)
  ...makeSessionTokenJwt({
    secret: process.env.SESSION_SECRET,
    ttl: 600, // 10 min — after expiry, validates against DB
  }),

  // OTP delivery
  email: otpEmailMinimal, // Format
  send: otpSendConsole, // Sender
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

// cookieAuth methods are ready to use:
// - cookieAuth.requestOtp(email)
// - cookieAuth.verifyOtp(email, code)
// - cookieAuth.getSession()
// - cookieAuth.signOut()
```

**Why No Database Drivers?**

Most auth libraries take a database pool and run queries internally. This means they control your schema, ID generation, and query patterns — and you fight them when it doesn't match your app.

We don't touch your database. You write the persistence functions using whatever ORM/driver you already use. The library is pure orchestration.

**Type Definitions:**

```ts
// OTP persistence adapters
type StoreOtpAdapter = (
  email: string,
  code: string,
  expiresAt: Date,
) => Promise<void>;
type VerifyOtpAdapter = (email: string, code: string) => Promise<boolean>;

// User persistence adapters (atomic upsert — no race conditions)
type UpsertUserAdapter = (
  email: string,
) => Promise<{ userId: string; isNew: boolean }>;

// Passkey persistence adapters
type StoreCredentialAdapter = (
  userId: string,
  credential: Credential,
) => Promise<void>;
type GetCredentialsAdapter = (userId: string) => Promise<Credential[]>;

// Session persistence adapters
type StoreSessionAdapter = (
  sessionId: string,
  userId: string,
  expiresAt: Date,
) => Promise<void>;
type GetSessionAdapter = (
  sessionId: string,
) => Promise<{ userId: string; expiresAt: Date } | null>;
type DeleteSessionAdapter = (sessionId: string) => Promise<void>;

// Session token adapters (separate encode/decode, but tightly coupled)
type EncodeSessionTokenAdapter = (payload: {
  sessionId: string;
  userId: string;
}) => string;
type DecodeSessionTokenAdapter = (token: string) => {
  sessionId: string;
  userId: string;
  valid: boolean;
  expired: boolean;
} | null;

// OTP delivery adapters
type OtpEmailAdapter = (code: string) => { subject: string; body: string };
type OtpSendAdapter = (
  email: string,
  content: { subject: string; body: string },
) => Promise<void>;

// Return adapters
type RequestOtpAdapter = (email: string) => Promise<{ success: boolean }>;
type VerifyOtpReturnAdapter = (
  email: string,
  code: string,
) => Promise<{ valid: boolean; userId?: string; token?: string }>;
type GenerateRegistrationOptionsAdapter = (
  userId: string,
) => Promise<PublicKeyCredentialCreationOptions>;
type VerifyRegistrationAdapter = (
  userId: string,
  credential: RegistrationCredential,
) => Promise<{ success: boolean }>;
type GenerateAuthenticationOptionsAdapter =
  () => Promise<PublicKeyCredentialRequestOptions>;
type VerifyAuthenticationAdapter = (
  credential: AuthenticationCredential,
) => Promise<{ valid: boolean; userId: string }>;

// Config
type MakeAuthConfig = {
  storeOtp: StoreOtpAdapter;
  verifyOtp: VerifyOtpAdapter;
  upsertUser: UpsertUserAdapter;
  storeCredential: StoreCredentialAdapter;
  getCredentials: GetCredentialsAdapter;
  storeSession: StoreSessionAdapter;
  getSession: GetSessionAdapter;
  deleteSession: DeleteSessionAdapter;
  encodeSessionToken: EncodeSessionTokenAdapter;
  decodeSessionToken: DecodeSessionTokenAdapter;
  email: OtpEmailAdapter;
  send: OtpSendAdapter;
};

// Return
type MakeAuthReturn = {
  requestOtp: RequestOtpAdapter;
  verifyOtp: VerifyOtpReturnAdapter;
  getSession: (token: string) => Promise<{ userId: string } | null>;
  deleteSession: (token: string) => Promise<void>;
  generateRegistrationOptions: GenerateRegistrationOptionsAdapter;
  verifyRegistration: VerifyRegistrationAdapter;
  generateAuthenticationOptions: GenerateAuthenticationOptionsAdapter;
  verifyAuthentication: VerifyAuthenticationAdapter;
};

// Main function
type MakeAuth = (config: MakeAuthConfig) => MakeAuthReturn;

// Cookie adapter — you provide these (framework-specific)
type CookieAdapter = {
  get: () => string | undefined;
  set: (token: string) => void;
  clear: () => void;
};

// Cookie auth — wraps auth with automatic cookie handling
type CookieAuthReturn = {
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (
    email: string,
    code: string,
  ) => Promise<{ valid: boolean; userId?: string }>;
  getSession: () => Promise<{ userId: string } | null>;
  signOut: () => Promise<void>;
};

type MakeCookieAuth = (config: {
  auth: MakeAuthReturn;
  cookie: CookieAdapter;
}) => CookieAuthReturn;
```

**Shipped adapters:**

Naming: simple adapters are `{variant}{Type}`, factories are `make{Variant}{Type}()`.

```
✓ otpEmailMinimal        — minimal OTP email template
✓ otpSendConsole         — logs OTP to console (dev)
✓ makeSessionTokenJwt()  — JWT encode/decode for session tokens
✓ makeCookieAuth()       — wraps auth with cookie handling
✓ makeMemoryAdapters()   — in-memory persistence (dev/test)
```

**Planned:**

```
○ otpEmailBranded()        — branded OTP email template
○ otpSendResend()          — send via Resend API
○ otpSendSendgrid()        — send via SendGrid API
○ *Pg(pool)                — PostgreSQL persistence adapters
```

### Client module (`@starmode/auth/client`)

**Usage:**

```ts
import { httpClient } from "@starmode/auth/client";

// HTTP client — method-based interface
const auth = httpClient("/api/auth");

await auth.requestOtp("user@example.com");
const result = await auth.verifyOtp("user@example.com", "123456");
await auth.signOut();
```

For server actions, you don't need a client wrapper — just call the methods directly:

```ts
// Server actions (Next.js / TanStack Start)
import { requestOtp, verifyOtp, signOut } from "./auth.server";

await requestOtp("user@example.com");
const result = await verifyOtp("user@example.com", "123456");
```

**Type definitions:**

```ts
// Client interface — matches CookieAuthReturn (minus getSession)
type AuthClient = {
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (
    email: string,
    code: string,
  ) => Promise<{ valid: boolean; userId?: string }>;
  signOut: () => Promise<void>;
};

// HTTP client factory
type HttpClient = (endpoint: string) => AuthClient;
```

The `AuthClient` type matches the shape of `cookieAuth` methods, making server actions directly usable as the client interface.

### Session management

**How it works:**

1. User authenticates (OTP verify or passkey)
2. Server creates session → encodes token → sets HttpOnly cookie
3. Browser automatically sends cookie with every request
4. Server decodes token → if expired, validates against DB → returns userId

**Token format via adapter:**

- `makeSessionTokenJwt({ secret, ttl })` — JWT with HMAC signature. Cached for TTL, then validates against DB.
- `sessionTokenAdapterOpaque({ secret })` — HMAC-signed session ID. Always validates against DB.

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

| Server                     | Client                | `getViewer()`          |
| -------------------------- | --------------------- | ---------------------- |
| `makeSessionTokenJwt()`    | `sessionDecoderJwt()` | Instant (local decode) |
| `makeSessionTokenOpaque()` | (none)                | Server call            |

For now, we keep it minimal — auth only, viewer fetching is your responsibility.

### Framework examples

**Next.js — Server actions:**

Export the `cookieAuth` methods directly. No wrapper needed.

```ts
// app/actions/auth.ts
"use server";

export const requestOtp = cookieAuth.requestOtp;
export const verifyOtp = cookieAuth.verifyOtp;
export const signOut = cookieAuth.signOut;
```

```tsx
// app/page.tsx
import { requestOtp, verifyOtp } from "./actions/auth";

// Just call them directly — fully typed!
await requestOtp("user@example.com");
const result = await verifyOtp("user@example.com", "123456");
```

**Next.js — API route:**

For HTTP clients, expose a single endpoint with method dispatch.

```ts
// app/api/auth/route.ts
import { z } from "zod";

const schema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("requestOtp"), email: z.string().email() }),
  z.object({
    method: z.literal("verifyOtp"),
    email: z.string().email(),
    code: z.string(),
  }),
  z.object({ method: z.literal("signOut") }),
]);

export async function POST(req: Request) {
  const { method, ...params } = schema.parse(await req.json());
  switch (method) {
    case "requestOtp":
      return Response.json(await cookieAuth.requestOtp(params.email));
    case "verifyOtp":
      return Response.json(
        await cookieAuth.verifyOtp(params.email, params.code),
      );
    case "signOut":
      await cookieAuth.signOut();
      return new Response(null, { status: 204 });
  }
}
```

```ts
// Client
import { httpClient } from "@starmode/auth/client";
const auth = httpClient("/api/auth");
```

**TanStack Start — Server functions:**

Export server functions that wrap `cookieAuth` methods.

```ts
// lib/auth.server.ts
import { createServerFn } from "@tanstack/react-start";

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((email: string) => email)
  .handler(({ data: email }) => cookieAuth.requestOtp(email));

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; code: string }) => input)
  .handler(({ data }) => cookieAuth.verifyOtp(data.email, data.code));

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  cookieAuth.signOut(),
);
```

```tsx
// routes/index.tsx
import { requestOtp, verifyOtp, signOut } from "../lib/auth.server";

// Just call them directly — fully typed!
await requestOtp("user@example.com");
const result = await verifyOtp({ email: "user@example.com", code: "123456" });
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

- Email OTP (request, verify)
- Passkeys (WebAuthn registration + authentication)
- Server: Framework-agnostic functions
- Client: Vanilla JS core + React hooks
- Tested with: Next.js (App Router), TanStack Start

**Development order:** OTP first, passkeys second. Types for both are defined upfront so the architecture accounts for passkeys from day one.

**Future:**

- Hosted user dashboard
- SMS OTP
- React Native support
- E2EE/PRF module — WebAuthn PRF for key derivation
- Session management utilities — `signOutAll()`, `getSessions()` (users can query DB directly for now)
- Passkey management utilities — `getPasskeys()`, `deletePasskey()` (users can query DB directly for now)
- Multi-email support — add/remove emails per user (not prevented now, users own their schema)
- LLM rules — ship Cursor/AI rules with the package, like `bun init` generates
- Email relay service — hosted OTP email sending so users don't need to set up Resend/SendGrid, DNS, SPF, etc. (separate project, `otpSendAdapterAuth` adapter ready)

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

**@starmode/auth**: Passkeys + OTP. That's it.

If you need OAuth, SAML, legacy browser support, or enterprise SSO—use Auth0, Clerk or Okta.

If you're building a new project and want auth that an LLM can set up in one prompt, this is it.
