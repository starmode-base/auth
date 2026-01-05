# STΛR MODΞ Auth

The LLM-friendly auth library. Auth that AI can set up in one prompt.

Passkeys first. OTP for bootstrap. That's it.

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

**Passkey-first.** Two primitives, each doing one job:

- **OTP** = email verification (bootstrap + recovery) → returns registration token
- **Passkey** = authentication (sign in) → returns session

Key design: **OTP never creates a session.** Only passkeys create sessions. This keeps the model simple and consistent for both regular apps and E2EE apps.

### Flows

```
Sign up:  email → OTP → registration token → register passkey → session
Sign in:  passkey → session
Recovery: email → OTP → registration token → register new passkey → session
```

Recovery is just sign-up again. Same flow, same code path.

**OTP recovery is optional.** Apps choose whether to expose it:

- Regular apps: expose it — user recovers account and data
- E2EE apps: don't expose it — OTP can't recover encrypted data anyway

### Registration token

OTP verification returns a short-lived, single-purpose **registration token** (not a session):

```ts
const { registrationToken } = await auth.verifyOtp(email, code);
// registrationToken: short-lived (5 min), can only register a passkey

const { session } = await auth.registerPasskey(registrationToken, credential);
// NOW you have a session
```

Why not a session?

- Session implies "you're authenticated, do whatever"
- After OTP, you can ONLY register a passkey
- No accidental OTP-only auth paths
- Consistent for E2EE and regular apps

### Server-side flows (implementation detail)

```
OTP verification (sign up / recovery):
1. User submits email
2. Server stores OTP, sends email
3. User submits OTP
4. Server verifies OTP (checks OTP table)
5. Server upserts user (atomic) → userId
6. Server creates registration token (short-lived, signed)
7. Server returns registration token
   ← user can now register a passkey →

Passkey registration (requires registration token):
1. Client has registration token from OTP verification
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

Key difference:

- OTP: email → verify → registration token (NOT a session)
- Passkey registration: requires registration token → creates session
- Passkey sign in: credential → verify → session

**Implementation notes:**

- User upsert must be atomic (single query with `ON CONFLICT` or equivalent) — no separate get + create
- Registration token is signed (JWT or HMAC) containing userId, short TTL (5 min)
- `getCredentialById(credentialId)` adapter needed to look up userId during passkey auth

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
  otpEmailMinimal,
  otpSendConsole,
  makeSessionTokenJwt,
  makeRegistrationTokenJwt,
} from "@starmode/auth";

const auth = makeAuth({
  // OTP persistence (ephemeral — deleted after use)
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
  getCredentialById: async (credentialId) => {
    /* your ORM — returns { userId, credential } or null */
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

  // Token encoding
  ...makeSessionTokenJwt({
    secret: process.env.SESSION_SECRET,
    ttl: 600, // 10 min — after expiry, validates against DB
  }),
  ...makeRegistrationTokenJwt({
    secret: process.env.REGISTRATION_SECRET,
    ttl: 300, // 5 min — short-lived, single-purpose
  }),

  // OTP delivery
  email: otpEmailMinimal, // Format
  send: otpSendConsole, // Sender

  // Passkey config
  passkeys: {
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

// cookieAuth methods are ready to use:
// OTP (bootstrap + recovery)
// - cookieAuth.requestOtp(email)
// - cookieAuth.verifyOtp(email, code) → { registrationToken }
// Passkey registration
// - cookieAuth.generateRegistrationOptions(registrationToken)
// - cookieAuth.verifyRegistration(registrationToken, credential) → sets cookie
// Passkey sign-in
// - cookieAuth.generateAuthenticationOptions()
// - cookieAuth.verifyAuthentication(credential) → sets cookie
// Session
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
type GetCredentialByIdAdapter = (
  credentialId: string,
) => Promise<{ userId: string; credential: Credential } | null>;

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

// Registration token adapters
type EncodeRegistrationTokenAdapter = (payload: {
  userId: string;
  email: string;
}) => string;
type DecodeRegistrationTokenAdapter = (token: string) => {
  userId: string;
  email: string;
  valid: boolean;
  expired: boolean;
} | null;

// Return types
type RequestOtpReturn = { success: boolean };
type VerifyOtpReturn = { valid: boolean; registrationToken?: string };
type GenerateRegistrationOptionsReturn = {
  options: PublicKeyCredentialCreationOptions;
  // PRF extension included if requested
};
type VerifyRegistrationReturn = {
  success: boolean;
  session?: { token: string; userId: string };
  // PRF result included if extension was used
  prf?: Uint8Array;
};
type GenerateAuthenticationOptionsReturn = {
  options: PublicKeyCredentialRequestOptions;
};
type VerifyAuthenticationReturn = {
  valid: boolean;
  session?: { token: string; userId: string };
  // PRF result included if extension was used
  prf?: Uint8Array;
};

// Config
type MakeAuthConfig = {
  // OTP persistence (ephemeral — deleted after use)
  storeOtp: StoreOtpAdapter;
  verifyOtp: VerifyOtpAdapter;

  // User persistence (atomic upsert)
  upsertUser: UpsertUserAdapter;

  // Passkey persistence
  storeCredential: StoreCredentialAdapter;
  getCredentials: GetCredentialsAdapter;
  getCredentialById: GetCredentialByIdAdapter; // for passkey sign-in lookup

  // Session persistence
  storeSession: StoreSessionAdapter;
  getSession: GetSessionAdapter;
  deleteSession: DeleteSessionAdapter;

  // Token encoding (session + registration)
  encodeSessionToken: EncodeSessionTokenAdapter;
  decodeSessionToken: DecodeSessionTokenAdapter;
  encodeRegistrationToken: EncodeRegistrationTokenAdapter;
  decodeRegistrationToken: DecodeRegistrationTokenAdapter;

  // OTP delivery
  email: OtpEmailAdapter;
  send: OtpSendAdapter;

  // Passkey config
  passkeys: {
    rpId: string; // e.g. "example.com"
    rpName: string; // e.g. "My App"
    // origin inferred from rpId, or explicit if needed
  };
};

// Return
type MakeAuthReturn = {
  // OTP (bootstrap + recovery)
  requestOtp: (email: string) => Promise<RequestOtpReturn>;
  verifyOtp: (email: string, code: string) => Promise<VerifyOtpReturn>;

  // Passkey registration (requires registration token)
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;

  // Passkey authentication (sign in)
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  // Session management
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

// Cookie auth — wraps auth with automatic cookie handling
type CookieAuthReturn = {
  // OTP (bootstrap + recovery)
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (email: string, code: string) => Promise<VerifyOtpReturn>;

  // Passkey registration (requires registration token from verifyOtp)
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>; // sets session cookie

  // Passkey authentication (sign in)
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>; // sets session cookie

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
✓ otpEmailMinimal            — minimal OTP email template
✓ otpSendConsole             — logs OTP to console (dev)
✓ makeSessionTokenJwt()      — JWT encode/decode for session tokens
✓ makeRegistrationTokenJwt() — JWT encode/decode for registration tokens
✓ makeCookieAuth()           — wraps auth with cookie handling
✓ makeMemoryAdapters()       — in-memory persistence (dev/test)
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

// Sign up flow: OTP → passkey registration
await auth.requestOtp("user@example.com");
const { registrationToken } = await auth.verifyOtp(
  "user@example.com",
  "123456",
);

const { options } = await auth.generateRegistrationOptions(registrationToken);
const credential = await navigator.credentials.create({ publicKey: options });
await auth.verifyRegistration(registrationToken, credential);
// Now user has a session

// Sign in flow: passkey only
const { options } = await auth.generateAuthenticationOptions();
const credential = await navigator.credentials.get({ publicKey: options });
await auth.verifyAuthentication(credential);
// Now user has a session

await auth.signOut();
```

For server actions, you don't need a client wrapper — just call the methods directly:

```ts
// Server actions (Next.js / TanStack Start)
import {
  requestOtp,
  verifyOtp,
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
} from "./auth.server";

// Sign up: OTP → passkey
await requestOtp("user@example.com");
const { registrationToken } = await verifyOtp("user@example.com", "123456");
// ... WebAuthn flow with registrationToken
```

**Type definitions:**

```ts
// Client interface — matches CookieAuthReturn (minus getSession)
type AuthClient = {
  // OTP (bootstrap + recovery)
  requestOtp: (email: string) => Promise<{ success: boolean }>;
  verifyOtp: (email: string, code: string) => Promise<VerifyOtpReturn>;

  // Passkey registration
  generateRegistrationOptions: (
    registrationToken: string,
  ) => Promise<GenerateRegistrationOptionsReturn>;
  verifyRegistration: (
    registrationToken: string,
    credential: RegistrationCredential,
  ) => Promise<VerifyRegistrationReturn>;

  // Passkey authentication (sign in)
  generateAuthenticationOptions: () => Promise<GenerateAuthenticationOptionsReturn>;
  verifyAuthentication: (
    credential: AuthenticationCredential,
  ) => Promise<VerifyAuthenticationReturn>;

  signOut: () => Promise<void>;
};

// HTTP client factory
type HttpClient = (endpoint: string) => AuthClient;
```

The `AuthClient` type matches the shape of `cookieAuth` methods, making server actions directly usable as the client interface.

### Session management

**How it works:**

1. User authenticates via passkey (OTP only gives a registration token, not a session)
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

// OTP (bootstrap + recovery)
export const requestOtp = cookieAuth.requestOtp;
export const verifyOtp = cookieAuth.verifyOtp;

// Passkey registration
export const generateRegistrationOptions =
  cookieAuth.generateRegistrationOptions;
export const verifyRegistration = cookieAuth.verifyRegistration;

// Passkey sign-in
export const generateAuthenticationOptions =
  cookieAuth.generateAuthenticationOptions;
export const verifyAuthentication = cookieAuth.verifyAuthentication;

export const signOut = cookieAuth.signOut;
```

```tsx
// app/page.tsx
import { requestOtp, verifyOtp, verifyRegistration } from "./actions/auth";

// Sign up: OTP → passkey registration
await requestOtp("user@example.com");
const { registrationToken } = await verifyOtp("user@example.com", "123456");
// ... WebAuthn flow, then:
await verifyRegistration(registrationToken, credential);
// User now has a session
```

**Next.js — API route:**

For HTTP clients, expose a single endpoint with method dispatch.

```ts
// app/api/auth/route.ts
import { z } from "zod";

const schema = z.discriminatedUnion("method", [
  // OTP
  z.object({ method: z.literal("requestOtp"), email: z.string().email() }),
  z.object({
    method: z.literal("verifyOtp"),
    email: z.string().email(),
    code: z.string(),
  }),
  // Passkey registration
  z.object({
    method: z.literal("generateRegistrationOptions"),
    registrationToken: z.string(),
  }),
  z.object({
    method: z.literal("verifyRegistration"),
    registrationToken: z.string(),
    credential: z.any(),
  }),
  // Passkey sign-in
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
      return Response.json(await cookieAuth.verifyOtp(body.email, body.code));
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

// OTP (bootstrap + recovery)
export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((email: string) => email)
  .handler(({ data: email }) => cookieAuth.requestOtp(email));

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; code: string }) => input)
  .handler(({ data }) => cookieAuth.verifyOtp(data.email, data.code));

// Passkey registration
export const generateRegistrationOptions = createServerFn({ method: "POST" })
  .inputValidator((token: string) => token)
  .handler(({ data: token }) => cookieAuth.generateRegistrationOptions(token));

export const verifyRegistration = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { token: string; credential: RegistrationCredential }) => input,
  )
  .handler(({ data }) =>
    cookieAuth.verifyRegistration(data.token, data.credential),
  );

// Passkey sign-in
export const generateAuthenticationOptions = createServerFn({
  method: "POST",
}).handler(() => cookieAuth.generateAuthenticationOptions());

export const verifyAuthentication = createServerFn({ method: "POST" })
  .inputValidator((credential: AuthenticationCredential) => credential)
  .handler(({ data }) => cookieAuth.verifyAuthentication(data));

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  cookieAuth.signOut(),
);
```

```tsx
// routes/index.tsx
import { requestOtp, verifyOtp, verifyRegistration } from "../lib/auth.server";

// Sign up: OTP → passkey registration
await requestOtp("user@example.com");
const { registrationToken } = await verifyOtp({
  email: "user@example.com",
  code: "123456",
});
// ... WebAuthn flow, then:
await verifyRegistration({ token: registrationToken, credential });
// User now has a session
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

- Passkeys (WebAuthn registration + authentication) — primary sign-in method
- Email OTP (request, verify) — bootstrap only, returns registration token
- Registration token — short-lived, single-purpose (register passkey)
- Server: Framework-agnostic functions
- Client: Vanilla JS core + React hooks
- Tested with: Next.js (App Router), TanStack Start

**Development order:** OTP + registration token first, passkeys second. Types for both are defined upfront so the architecture accounts for passkeys from day one.

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

**@starmode/auth**: Passkeys first. OTP for bootstrap. That's it.

Do you want passkeys? Yes → use this. No → this isn't for you.

If you need OAuth, SAML, legacy browser support, or enterprise SSO—use Auth0, Clerk or Okta.

If you're building a new project and want passkey auth that an LLM can set up in one prompt, this is it.

**Security model:**

- Passkeys are the only sign-in method (phishing-resistant)
- OTP verifies email ownership (for signup and optional recovery)
- No OTP sign-in — eliminates entire class of attacks
- E2EE compatible — PRF extension passthrough for key derivation

**Recovery:**

- Encourage users to register multiple passkeys
- OTP recovery is optional — apps choose whether to expose it
- For E2EE apps: losing all passkeys = losing data (that's the security contract)
