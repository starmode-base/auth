# ΛUTH

Passkeys and OTP as composable primitives. Auth that an agent can set up in one prompt.

> **Status: pre-release.** This README is the API we are building toward — it drives implementation. Where it disagrees with the code, the README wins. See [SPEC.md](../../SPEC.md) for design history and rationale.

## The deal

- **You own all I/O.** Storage, otp delivery, cookies — you provide them as small typed callbacks, using whatever database and email service you already have.
- **The core owns protocol and crypto.** WebAuthn verification, HMAC signing, expiry rules, challenge lifecycle.
- **Zero runtime dependencies.** Your database is the source of truth. No hosted service required, no OAuth dashboards, no DNS setup.
- **Explicit over implicit.** No magic defaults — every adapter is a visible import. If it's configured, you can see it.

## Install

```sh
bun add @starmode/auth
```

## One entry point

`makeAuth` creates the session core. Strategies chain on:

```ts
makeAuth(session); // sessions only
makeAuth(session).withOtp(otp); // + requestOtp, verifyOtp
makeAuth(session).withPasskey(passkey); // + passkey ceremonies
makeAuth(session).withOtp(otp).withPasskey(passkey); // everything
```

Every step returns a complete, usable auth object — there is no `.build()` finisher, and chain order doesn't matter.

The type-safety contract:

- Methods follow the chain. `verifyOtp` only exists after `.withOtp()` — calling it on a passkey-only instance is a type error, not a runtime error.
- Each step takes a concrete config type: unknown keys are rejected, every field is required. If it matters, you set it.
- No combination of calls compiles but half-works — misconfiguration is unrepresentable.

## Quickstarts

The blocks below use memory storage and console otp delivery — the dev setup. Swapping to production means replacing those imports with your database functions and email service (see [Adapters](#adapters)).

### OTP only

The simplest possible auth: email is both identity and sign-in.

```ts
// src/auth.ts
import {
  makeAuth,
  memorySessionStorage,
  memoryOtpStorage,
  sessionHmac,
  otpDeliveryConsole,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack"; // or /nextjs

export const auth = makeAuth({
  storage: memorySessionStorage(),
  codec: sessionHmac({
    secret: process.env.AUTH_SECRET!,
    ttl: 10 * 60 * 1000,
  }),
  transport: sessionTransportTanstack(sessionCookieDefaults),
  ttl: 30 * 24 * 60 * 60 * 1000, // inactivity timeout
  debug: false,
}).withOtp({
  storage: memoryOtpStorage(),
  delivery: otpDeliveryConsole({ ttl: 10 * 60 * 1000 }),
});
```

Sign-in is three primitives in a server function:

```ts
// server function — sign up or sign in, same code
const result = await auth.verifyOtp({ identifier, otp });
if (!result.success) return result;

const user = await upsertUser(identifier); // your database, your shape
return auth.createSession({ userId: user.id });
```

`verifyOtp` never creates a session — that's your explicit call. This is what makes otp usable for both sign-in and plain email verification.

### Passkeys only

No email service, no external anything. The whole setup lives in your repo.

```ts
export const auth = makeAuth({/* session core, same as above */}).withPasskey({
  storage: memoryCredentialStorage(),
  challenges: memoryChallengeStorage(),
  registrationCodec: registrationHmac({
    secret: process.env.AUTH_SECRET!,
    ttl: 5 * 60 * 1000,
  }),
  webAuthn: {
    rpId: "localhost",
    rpName: "My app",
    challengeTtl: 5 * 60 * 1000,
  },
});
```

Sign-up: your server function creates the user and mints a registration token; the client runs the ceremony.

```ts
// server function
const user = await createUser(); // your database
return auth.createRegistrationToken({ userId: user.id, identifier: user.id });
```

```ts
// client — three steps, or use usePasskeyRegistration() from the react package
const { options } = await authClient.generateRegistrationOptions({
  registrationToken,
});
const credential = await authClient.createPasskey(options);
await authClient.verifyRegistration({ registrationToken, credential });
// user now has a passkey and a session
```

Sign-in is the same shape with the authentication methods — no token needed.

### OTP + passkeys (recommended default)

OTP proves inbox ownership at sign-up; passkeys do the everyday sign-in. Config is the union: chain both `.withOtp()` and `.withPasskey()`.

```ts
// server function — after otp verify, bridge into the passkey ceremony
const result = await auth.verifyOtp({ identifier, otp });
if (!result.success) return result;

const user = await upsertUser(identifier);
return auth.createRegistrationToken({ userId: user.id, identifier });
```

The registration token is the bridge between the two strategies: it carries "identity verified" from otp (or from an existing session) into the passkey registration, without exposing the userId to the client.

**Strict mode** is not config — it's one guard in your app code: refuse `requestOtp` for users who already have passkeys. See `examples/tanstack-start-react/otp-passkey-strict-memory/`.

## Primitives

| Primitive                                               | What it does                      | Client-callable |
| ------------------------------------------------------- | --------------------------------- | --------------- |
| `createSession({ userId })`                             | Create session for user           | no              |
| `getSession()`                                          | Session data or null              | no              |
| `signOut()` / `signOutAll()`                            | End current / all sessions        | yes / no        |
| `requestOtp({ identifier })`                            | Send otp to email/phone           | yes             |
| `verifyOtp({ identifier, otp })`                        | Verify otp (no session)           | yes             |
| `createRegistrationToken({ userId, identifier })`       | Authorize a passkey registration  | no              |
| `validateRegistrationToken({ token })`                  | Decode → `{ userId, identifier }` | no              |
| `generateRegistrationOptions({ registrationToken })`    | WebAuthn registration options     | yes             |
| `verifyRegistration({ registrationToken, credential })` | Verify + store passkey + session  | yes             |
| `generateAuthenticationOptions()`                       | WebAuthn sign-in options          | yes             |
| `verifyAuthentication({ credential })`                  | Verify passkey + session          | yes             |

Every method returns a `Result` — expected failures are values (`{ success: false, error: "invalid_otp" }`), never exceptions.

## Adapters

What each config group needs, and what we ship:

| Group     | Adapter           | Contract (you implement)                           | Shipped presets                                |
| --------- | ----------------- | -------------------------------------------------- | ---------------------------------------------- |
| `session` | storage           | store / get / delete / deleteAll                   | `memorySessionStorage()`                       |
| `session` | codec             | encode / decode tokens                             | `sessionHmac()`, `sessionOpaque()`             |
| `session` | transport         | read / write the token per request                 | cookie, header, memory, `/tanstack`, `/nextjs` |
| `otp`     | storage           | store / verify (one-time use, expiry, attempt cap) | `memoryOtpStorage()`                           |
| `otp`     | delivery          | send(identifier, otp)                              | `otpDeliveryConsole()`; Resend planned         |
| `passkey` | storage           | credential CRUD + counter update                   | `memoryCredentialStorage()`                    |
| `passkey` | challenges        | short-lived challenge store                        | `memoryChallengeStorage()`                     |
| `passkey` | registrationCodec | encode / decode registration tokens                | `registrationHmac()`                           |

Memory presets are for local dev and tests. A production adapter is a handful of functions against your own schema — the library never touches your database directly.

## Client

Two ways to wire the browser to the server:

1. **Server functions** (TanStack Start, Next.js server actions) — call the primitives directly, no extra layer. What the examples use.
2. **REST** — `makeAuthHandler(auth)` mounts one POST endpoint; `makeAuthClient(endpoint)` gives the browser a typed client, including the WebAuthn ceremony helpers `createPasskey` / `getPasskey`.

React hooks for the multi-step passkey ceremonies live in the companion react package (`usePasskeyRegistration`, `usePasskeyAuthentication`).

## Examples

Every supported setup has a runnable example under [`examples/`](../../examples/) — otp-only, passkey-only, combined, combined strict — across TanStack Start, Next.js, and plain Bun + React.

## License

MIT, see [LICENSE.md](./LICENSE.md).
