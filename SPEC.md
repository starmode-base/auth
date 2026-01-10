# STΛR MODΞ Auth

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

| Primitive                                | What it does                   | Client |
| ---------------------------------------- | ------------------------------ | ------ |
| `requestOtp(email)`                      | Send OTP to email              | ✅     |
| `verifyOtp(email, otp)`                  | Verify OTP → `{ valid }`       | ✅     |
| `createRegistrationToken(userId, email)` | Create registration token      | ❌     |
| `validateRegistrationToken(token)`       | Validate → `{ userId, email }` | ❌     |
| `generateRegistrationOptions(token)`     | WebAuthn registration options  | ✅     |
| `verifyRegistration(token, credential)`  | Verify + store + session       | ✅     |
| `generateAuthenticationOptions()`        | WebAuthn sign-in options       | ✅     |
| `verifyAuthentication(credential)`       | Verify + session               | ✅     |
| `getSession(token)`                      | Get session data               | ❌     |
| `deleteSession(token)`                   | Delete session                 | ❌     |

**Client column:** ✅ = exposed via `httpClient` / callable from browser. ❌ = server-side only.

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
await auth.requestOtp(email);
const { valid } = await auth.verifyOtp(email, otp);
if (valid) {
  const { userId } = await db.users.upsert({ email }); // App's DB
  const { registrationToken } = await auth.createRegistrationToken(
    userId,
    email,
  );
  // Continue with passkey registration...
}

// Change email — different flow, same primitives
await auth.requestOtp(newEmail);
const { valid } = await auth.verifyOtp(newEmail, otp);
if (valid) {
  await db.users.update(userId, { email: newEmail }); // App's DB
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
  upsertUser: async (email) => db.users.upsert({ email }),
});

// Usage — one call instead of multiple
const { registrationToken } = await signUp(email, otp);
```

Flow adapters are optional. You can always use primitives directly.

### Server-side flows (implementation detail)

```
OTP verification:
1. User submits email
2. Server stores OTP, sends via configured channel
3. User submits OTP
4. Server verifies OTP (checks OTP table)
5. Server returns { valid: true }
   ← app decides what to do next →

Sign up (app orchestrates):
1. App calls verifyOtp → { valid }
2. App upserts user → userId
3. App calls createRegistrationToken(userId, email)
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

- Registration token is HMAC-signed containing userId + email, short TTL (5 min)
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
  otp: otpSendConsole,

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

// Primitives available:
// OTP
// - auth.requestOtp(email) → { success }
// - auth.verifyOtp(email, otp) → { valid }
// Registration token
// - auth.createRegistrationToken(userId, email) → { registrationToken }
// - auth.validateRegistrationToken(token) → { userId, email, valid }
// Passkey
// - auth.generateRegistrationOptions(token) → { options }
// - auth.verifyRegistration(token, credential) → { success, session, prf? }
// - auth.generateAuthenticationOptions() → { options }
// - auth.verifyAuthentication(credential) → { valid, session, prf? }
// Session
// - auth.getSession(token) → { userId } | null
// - auth.deleteSession(token) → void
```

**Custom storage adapters:**

```ts
const auth = makeAuth({
  storage: {
    otp: {
      store: async (email, otp, expiresAt) => {
        /* your ORM */
      },
      verify: async (email, otp) => {
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
    },
  },
  session: makeSessionHmac({ secret, ttl: 600 }),
  registration: makeRegistrationHmac({ secret, ttl: 300 }),
  otp: otpSendConsole,
  webauthn: { rpId: "example.com", rpName: "My App" },
});
```

**Why No Database Drivers?**

Most auth libraries take a database pool and run queries internally. This means they control your schema, ID generation, and query patterns — and you fight them when it doesn't match your app.

We don't touch your database. You write the persistence functions using whatever ORM/driver you already use. The library is pure orchestration.

**Type Definitions:**

```ts
// Storage adapter (persistence)
type StorageAdapter = {
  otp: {
    store: (email: string, otp: string, expiresAt: Date) => Promise<void>;
    verify: (email: string, otp: string) => Promise<boolean>;
  };
  session: {
    store: (
      sessionId: string,
      userId: string,
      expiresAt: Date,
    ) => Promise<void>;
    get: (
      sessionId: string,
    ) => Promise<{ userId: string; expiresAt: Date } | null>;
    delete: (sessionId: string) => Promise<void>;
  };
  credential: {
    store: (userId: string, credential: Credential) => Promise<void>;
    get: (userId: string) => Promise<Credential[]>;
    getById: (
      credentialId: string,
    ) => Promise<{ userId: string; credential: Credential } | null>;
    updateCounter: (credentialId: string, counter: number) => Promise<void>;
  };
};

// Session codec (async for Web Crypto API)
type SessionCodec = {
  encode: (payload: { sessionId: string; userId: string }) => Promise<string>;
  decode: (token: string) => Promise<{
    sessionId: string;
    userId: string;
    valid: boolean;
    expired: boolean;
  } | null>;
};

// Registration codec (async for Web Crypto API)
type RegistrationCodec = {
  encode: (payload: { userId: string; email: string }) => Promise<string>;
  decode: (token: string) => Promise<{
    userId: string;
    email: string;
    valid: boolean;
    expired: boolean;
  } | null>;
};

// OTP delivery adapter
type SendOtp = (email: string, otp: string) => Promise<void>;

// Return types
type RequestOtpReturn = { success: boolean };
type VerifyOtpReturn = { valid: boolean };
type CreateRegistrationTokenReturn = { registrationToken: string };
type ValidateRegistrationTokenReturn = {
  userId: string;
  email: string;
  valid: boolean;
};
type GenerateRegistrationOptionsReturn = {
  options: PublicKeyCredentialCreationOptions;
};
type VerifyRegistrationReturn = {
  success: boolean;
  session?: { token: string; userId: string };
  prf?: Uint8Array; // PRF result if extension was used
};
type GenerateAuthenticationOptionsReturn = {
  options: PublicKeyCredentialRequestOptions;
};
type VerifyAuthenticationReturn = {
  valid: boolean;
  session?: { token: string; userId: string };
  prf?: Uint8Array; // PRF result if extension was used
};

// Config
type MakeAuthConfig = {
  storage: StorageAdapter;
  session: SessionCodec;
  registration: RegistrationCodec;
  otp: SendOtp;
  webauthn: {
    rpId: string;
    rpName: string;
  };
};

// Return — all primitives
type MakeAuthReturn = {
  // OTP primitives
  requestOtp: (email: string) => Promise<RequestOtpReturn>;
  verifyOtp: (email: string, otp: string) => Promise<VerifyOtpReturn>;

  // Registration token primitives
  createRegistrationToken: (
    userId: string,
    email: string,
  ) => Promise<CreateRegistrationTokenReturn>;
  validateRegistrationToken: (
    token: string,
  ) => Promise<ValidateRegistrationTokenReturn>;

  // Passkey primitives
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  // Session primitives
  getSession: (token: string) => Promise<{ userId: string } | null>;
  deleteSession: (token: string) => Promise<void>;
};

// Main function
type MakeAuth = (config: MakeAuthConfig) => MakeAuthReturn;

// Cookie adapter — you provide these (framework-specific)
type CookieAdapter = {
  get: () => string | undefined;
  set: (token: string) => void;
  clear: () => void;
};

// Cookie auth — wraps primitives with automatic cookie handling
type CookieAuthReturn = {
  // OTP
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (email: string, otp: string) => Promise<VerifyOtpReturn>;

  // Registration token (server-side only — use in composed flows like signUp)
  createRegistrationToken: (
    userId: string,
    email: string,
  ) => Promise<CreateRegistrationTokenReturn>;

  // Passkey (sets session cookie automatically)
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  // Session
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
Storage:
✓ makeMemoryAdapters()         — in-memory persistence (dev/test)

Codecs:
✓ makeSessionHmac()            — HMAC-signed session tokens (stateless)
✓ makeSessionOpaque()          — opaque session tokens (requires DB lookup)
✓ makeRegistrationHmac()       — HMAC-signed registration tokens

OTP delivery:
✓ otpSendConsole               — logs OTP to console (dev)

Wrappers:
✓ makeCookieAuth()             — wraps auth with cookie handling
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
import { httpClient } from "@starmode/auth/client";

const auth = httpClient("/api/auth");

// Sign up flow: client calls server-side composed flow
await auth.requestOtp("user@example.com");
// signUp is a server action that does: verifyOtp + upsertUser + createRegistrationToken
const { registrationToken } = await signUp("user@example.com", "123456");

// Continue with passkey registration
const { options } = await auth.generateRegistrationOptions(registrationToken);
const credential = await navigator.credentials.create({ publicKey: options });
await auth.verifyRegistration(registrationToken, credential);
// Now user has a session

// Sign in flow: passkey only
const { options: authOptions } = await auth.generateAuthenticationOptions();
const authCredential = await navigator.credentials.get({
  publicKey: authOptions,
});
await auth.verifyAuthentication(authCredential);
// Now user has a session

await auth.signOut();
```

**Server-side flow (required for signup):**

The `signUp` flow must run server-side because it needs to:

1. Verify OTP
2. Upsert user in your database → get userId
3. Create registration token with userId

```ts
// Server-side (Next.js server action, TanStack server function, etc.)
import { makeSignUpFlow } from "@starmode/auth/flows";

export const signUp = makeSignUpFlow({
  auth,
  upsertUser: async (email) => db.users.upsert({ email }),
});

// Client calls this server action
const { registrationToken } = await signUp("user@example.com", "123456");
```

**Type definitions:**

```ts
// Client interface — OTP + passkey primitives only
// Note: createRegistrationToken is server-side only (needs userId from DB)
type AuthClient = {
  // OTP
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (email: string, otp: string) => Promise<{ valid: boolean }>;

  // Passkey (registrationToken comes from server-side signUp flow)
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  signOut: () => Promise<void>;
};

// HTTP client factory
type HttpClient = (endpoint: string) => AuthClient;
```

The `AuthClient` exposes OTP and passkey primitives. Registration token creation happens server-side via composed flows like `signUp`.

### Session management

**How it works:**

1. User authenticates via passkey (OTP only gives a registration token, not a session)
2. Server creates session → encodes token → sets HttpOnly cookie
3. Browser automatically sends cookie with every request
4. Server decodes token → if expired, validates against DB → returns userId

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

**Next.js — Server actions (primitives):**

Export the `cookieAuth` primitives directly.

```ts
// app/actions/auth.ts
"use server";
import { db } from "@/lib/db";

// Client-callable primitives
export const requestOtp = cookieAuth.requestOtp;
export const verifyOtp = cookieAuth.verifyOtp;
export const generateRegistrationOptions =
  cookieAuth.generateRegistrationOptions;
export const verifyRegistration = cookieAuth.verifyRegistration;
export const generateAuthenticationOptions =
  cookieAuth.generateAuthenticationOptions;
export const verifyAuthentication = cookieAuth.verifyAuthentication;
export const signOut = cookieAuth.signOut;

// Composed flow — this is what clients call for signup
// (createRegistrationToken is used internally, not exposed directly)
export async function signUp(email: string, otp: string) {
  const { valid } = await cookieAuth.verifyOtp(email, otp);
  if (!valid) return { valid: false };

  const { userId } = await db.users.upsert({ email });
  return cookieAuth.createRegistrationToken(userId, email);
}
```

```tsx
// app/page.tsx
import { requestOtp, signUp, verifyRegistration } from "./actions/auth";

// Sign up using composed flow
await requestOtp("user@example.com");
const { registrationToken } = await signUp("user@example.com", "123456");
// ... WebAuthn flow, then:
await verifyRegistration(registrationToken, credential);
// User now has a session
```

**Next.js — API route:**

For HTTP clients, expose primitives with method dispatch.

```ts
// app/api/auth/route.ts
import { z } from "zod";

const schema = z.discriminatedUnion("method", [
  // OTP
  z.object({ method: z.literal("requestOtp"), email: z.string().email() }),
  z.object({
    method: z.literal("verifyOtp"),
    email: z.string().email(),
    otp: z.string(),
  }),
  // Passkey (createRegistrationToken is NOT exposed — use signUp server action)
  z.object({
    method: z.literal("generateRegistrationOptions"),
    registrationToken: z.string(),
  }),
  z.object({
    method: z.literal("verifyRegistration"),
    registrationToken: z.string(),
    credential: z.any(),
  }),
  z.object({ method: z.literal("generateAuthenticationOptions") }),
  z.object({ method: z.literal("verifyAuthentication"), credential: z.any() }),
  // Session
  z.object({ method: z.literal("signOut") }),
]);

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  switch (body.method) {
    case "requestOtp":
      return Response.json(await cookieAuth.requestOtp(body.email));
    case "verifyOtp":
      return Response.json(await cookieAuth.verifyOtp(body.email, body.otp));
    case "generateRegistrationOptions":
      return Response.json(
        await cookieAuth.generateRegistrationOptions(body.registrationToken),
      );
    case "verifyRegistration":
      return Response.json(
        await cookieAuth.verifyRegistration(
          body.registrationToken,
          body.credential,
        ),
      );
    case "generateAuthenticationOptions":
      return Response.json(await cookieAuth.generateAuthenticationOptions());
    case "verifyAuthentication":
      return Response.json(
        await cookieAuth.verifyAuthentication(body.credential),
      );
    case "signOut":
      await cookieAuth.signOut();
      return new Response(null, { status: 204 });
  }
}
```

**TanStack Start — Server functions:**

Export server functions that wrap primitives.

```ts
// lib/auth.server.ts
import { createServerFn } from "@tanstack/react-start";
import { db } from "./db";

// Primitives
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((email: string) => email)
  .handler(({ data: email }) => cookieAuth.requestOtp(email));

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; otp: string }) => input)
  .handler(({ data }) => cookieAuth.verifyOtp(data.email, data.otp));

// Composed flow
export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; otp: string }) => input)
  .handler(async ({ data }) => {
    const { valid } = await cookieAuth.verifyOtp(data.email, data.otp);
    if (!valid) return { valid: false };

    const { userId } = await db.users.upsert({ email: data.email });
    return cookieAuth.createRegistrationToken(userId, data.email);
  });

// ... other primitives
```

```tsx
// routes/index.tsx
import { requestOtp, signUp, verifyRegistration } from "../lib/auth.server";

// Sign up using composed flow
await requestOtp("user@example.com");
const { registrationToken } = await signUp({
  email: "user@example.com",
  otp: "123456",
});
// ... WebAuthn flow, then:
await verifyRegistration({ registrationToken, credential });
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
- Session: `getSession`, `deleteSession`

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
