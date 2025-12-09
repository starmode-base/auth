# STΛR MODΞ Auth

The LLM-friendly auth library. Auth that AI can set up in one prompt.

Passkeys + OTP. That's it.

## Core philosophy

- **Library-first** — your database is the source of truth, with an optional hosted service
- **LLM-friendly** — no DNS config, no OAuth dashboards, no external clicks required
- **Explicit over implicit** — no magic defaults, everything is a visible import
- **Nano scope** — intentionally small, won't grow into Auth0

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

### Server module (`@starmode/auth`)

**Usage:**

```ts
import {
  makeAuth,
  makeAuthHandler,
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

// Wrap for transport (HTTP, server actions, etc.)
const handler = makeAuthHandler(auth);
// handler('requestOtp', { email }) → calls auth.requestOtp(email)
```

**Why No Database Drivers?**

Most auth libraries take a database pool and run queries internally. This means they control your schema, ID generation, and query patterns — and you fight them when it doesn't match your app.

We don't touch your database. You write the persistence functions using whatever ORM/driver you already use. The library is pure orchestration.

**Exported Types:**

```ts
import type {
  // Main function
  MakeAuth,
  MakeAuthConfig,
  MakeAuthReturn,

  // Handler
  MakeAuthHandler,
  AuthHandler,

  // Persistence adapters
  StoreOtpAdapter,
  VerifyOtpAdapter,
  UpsertUserAdapter,
  StoreCredentialAdapter,
  GetCredentialsAdapter,

  // Session adapters
  StoreSessionAdapter,
  GetSessionAdapter,
  DeleteSessionAdapter,
  EncodeSessionTokenAdapter,
  DecodeSessionTokenAdapter,

  // OTP adapters
  OtpEmailAdapter,
  OtpSendAdapter,

  // Return adapters
  RequestOtpAdapter,
  VerifyOtpReturnAdapter,
  GenerateRegistrationOptionsAdapter,
  VerifyRegistrationAdapter,
  GenerateAuthenticationOptionsAdapter,
  VerifyAuthenticationAdapter,
} from "@starmode/auth";
```

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

// Handler
type AuthHandler = (
  method: string,
  args: Record<string, unknown>,
) => Promise<unknown>;
type MakeAuthHandler = (auth: MakeAuthReturn) => AuthHandler;
```

**Shipped Adapters:**

Naming pattern:

- Simple adapters (no config/state): `{variant}{Type}` — e.g., `otpEmailMinimal`, `otpSendConsole`
- Factories (need config/state): `make{Variant}{Type}` — e.g., `makeSessionTokenJwt()`, `makeMemoryAdapters()`

| Type                                                      | Adapters                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OtpEmailAdapter`                                         | `otpEmailMinimal`, `otpEmailBranded({ appName, color })`                                                                                                  |
| `OtpSendAdapter`                                          | `otpSendConsole`, `otpSendResend({ apiKey })`, `otpSendSendgrid({ apiKey })`                                                                              |
| `StoreOtpAdapter`                                         | `storeOtpPg(pool)`                                                                                                                                        |
| `VerifyOtpAdapter`                                        | `verifyOtpPg(pool)`                                                                                                                                       |
| `UpsertUserAdapter`                                       | `upsertUserPg(pool)`                                                                                                                                      |
| `StoreCredentialAdapter`                                  | `storeCredentialPg(pool)`                                                                                                                                 |
| `GetCredentialsAdapter`                                   | `getCredentialsPg(pool)`                                                                                                                                  |
| `StoreSessionAdapter`                                     | `storeSessionPg(pool)`                                                                                                                                    |
| `GetSessionAdapter`                                       | `getSessionPg(pool)`                                                                                                                                      |
| `DeleteSessionAdapter`                                    | `deleteSessionPg(pool)`                                                                                                                                   |
| `EncodeSessionTokenAdapter` + `DecodeSessionTokenAdapter` | `makeSessionTokenJwt({ secret, ttl })`, `makeSessionTokenOpaque({ secret })` — returns `{ encodeSessionToken, decodeSessionToken }` to spread into config |

### Client module (`@starmode/auth/client`)

**Usage:**

```ts
import { makeAuthClient, httpTransport } from "@starmode/auth/client";

// HTTP transport
const client = makeAuthClient({
  transport: httpTransport("/api/auth"),
});

// Or pass server action directly (Next.js / TanStack Start)
import { authAction } from "./actions";
const client = makeAuthClient({
  transport: authAction,
});

// Typed methods
await client.requestOtp({ email: "user@example.com" });
const result = await client.verifyOtp({
  email: "user@example.com",
  code: "123456",
});
```

**Exported Types:**

```ts
import type {
  // Client
  AuthClient,
  MakeAuthClient,
  MakeAuthClientConfig,

  // Transport
  AuthTransportAdapter,
  HttpTransport,

  // Method adapters
  ClientRequestOtpAdapter,
  ClientVerifyOtpAdapter,
  ClientGetRegistrationOptionsAdapter,
  ClientVerifyRegistrationAdapter,
  ClientGetAuthenticationOptionsAdapter,
  ClientVerifyAuthenticationAdapter,
} from "@starmode/auth/client";
```

**Type Definitions:**

```ts
// Transport
type AuthTransportAdapter = (
  method: string,
  args: Record<string, unknown>,
) => Promise<unknown>;
type HttpTransport = (endpoint: string) => AuthTransportAdapter;

// Method adapters
type ClientRequestOtpAdapter = (args: {
  email: string;
}) => Promise<{ success: boolean }>;
type ClientVerifyOtpAdapter = (args: {
  email: string;
  code: string;
}) => Promise<{ valid: boolean; userId?: string }>;
type ClientGetRegistrationOptionsAdapter = (args: {
  userId: string;
}) => Promise<PublicKeyCredentialCreationOptions>;
type ClientVerifyRegistrationAdapter = (args: {
  userId: string;
  credential: RegistrationCredential;
}) => Promise<{ success: boolean }>;
type ClientGetAuthenticationOptionsAdapter =
  () => Promise<PublicKeyCredentialRequestOptions>;
type ClientVerifyAuthenticationAdapter = (args: {
  credential: AuthenticationCredential;
}) => Promise<{ valid: boolean; userId: string }>;

// Client — all methods make server calls via transport
type AuthClient = {
  // OTP
  requestOtp: ClientRequestOtpAdapter; // → server: sends OTP email
  verifyOtp: ClientVerifyOtpAdapter; // → server: validates code, sets session cookie

  // Passkeys
  getRegistrationOptions: ClientGetRegistrationOptionsAdapter; // → server: generates WebAuthn challenge
  verifyRegistration: ClientVerifyRegistrationAdapter; // → server: stores credential
  getAuthenticationOptions: ClientGetAuthenticationOptionsAdapter; // → server: generates WebAuthn challenge
  verifyAuthentication: ClientVerifyAuthenticationAdapter; // → server: validates credential, sets session cookie

  // Session
  signOut: () => Promise<void>; // → server: revokes session in DB, clears cookie
};

type MakeAuthClientConfig = {
  transport: AuthTransportAdapter;
  // Future: sessionDecoder?: SessionDecoderAdapter
};

type MakeAuthClient = (config: MakeAuthClientConfig) => AuthClient;
```

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

We could later add a `sessionDecoder` adapter to the client, enabling `client.getViewer()`:

```ts
// JWT — decodes locally, instant (no server call)
const client = makeAuthClient({
  transport: httpTransport("/api/auth"),
  sessionDecoder: sessionDecoderAdapterJwt(),
});

const viewer = client.getViewer(); // → reads from cookie, instant

// Opaque — can't decode locally, calls server
const client = makeAuthClient({
  transport: httpTransport("/api/auth"),
  sessionDecoder: sessionDecoderAdapterOpaque(), // or omit entirely
});

const viewer = await client.getViewer(); // → calls server
```

Same API, different behavior based on adapter. The `sessionDecoder` matches the server's `sessionToken` adapter:

| Server                     | Client                | `getViewer()`          |
| -------------------------- | --------------------- | ---------------------- |
| `makeSessionTokenJwt()`    | `sessionDecoderJwt()` | Instant (local decode) |
| `makeSessionTokenOpaque()` | (none)                | Server call            |

This would be additive (no breaking changes to existing code). For now, we keep it minimal — auth only, viewer fetching is your responsibility.

### Framework examples

**Express:**

```ts
// Server
app.post("/auth", async (req, res) => {
  const { method, args } = req.body;
  const result = await handler(method, args);
  res.json(result);
});

// Client
const client = makeAuthClient({
  transport: httpTransport("http://localhost:3000/auth"),
});
```

**Next.js — Server Actions:**

- https://nextjs.org/docs/app/api-reference/directives/use-server
- https://nextjs.org/docs/app/getting-started/updating-data#what-are-server-functions

```ts
// app/actions/auth.ts
"use server";
export async function authAction(
  method: string,
  args: Record<string, unknown>,
) {
  return handler(method, args);
}

// Client
const client = makeAuthClient({ transport: authAction });
```

**Next.js — API Route:**

- https://nextjs.org/docs/app/getting-started/route-handlers

```ts
// app/api/auth/route.ts
export async function POST(req: Request) {
  const { method, args } = await req.json();
  return Response.json(await handler(method, args));
}

// Client
const client = makeAuthClient({
  transport: httpTransport("/api/auth"),
});
```

**TanStack Start — Server Functions:**

- https://tanstack.com/start/latest/docs/framework/react/guide/server-functions

```ts
// Server
export const authAction = createServerFn("POST", async ({ method, args }) => {
  return handler(method, args);
});

// Client
const client = makeAuthClient({ transport: authAction });
```

**TanStack Start — Server Routes:**

- https://tanstack.com/start/latest/docs/framework/react/guide/server-routes

```ts
// routes/api/auth.ts
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { method, args } = await request.json();
        return json(await handler(method, args));
      },
    },
  },
});

// Client
const client = makeAuthClient({
  transport: httpTransport("/api/auth"),
});
```

### React hooks

Only things that need reactive state (loading, error) or depend on other hooks need a React hook. Everything else can call the client directly.

**Hooks (manage async state):**

- `useOtpFlow()` — manages OTP request/verify with loading/error state
- `usePasskeyRegister()` — manages WebAuthn registration flow
- `usePasskeySignIn()` — manages WebAuthn authentication flow

**Direct calls (no hook needed):**

```ts
// These are simple one-shot calls (still make server calls via transport)
await client.signOut(); // revokes session server-side + clears cookie
await client.requestOtp({ email });
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
