# ΛUTH

The LLM-friendly auth library. Passkeys + OTP. That's it.

## Install

```sh
bun add @starmode/auth
```

## Quick start

```ts
import {
  makeAuth,
  makeMemoryAdapters,
  makeSessionHmac,
  makeRegistrationHmac,
  otpSendConsole,
} from "@starmode/auth";

const auth = makeAuth({
  storage: makeMemoryAdapters(),
  session: makeSessionHmac({
    secret: process.env.SESSION_SECRET!,
    ttl: 600,
  }),
  registration: makeRegistrationHmac({
    secret: process.env.REGISTRATION_SECRET!,
    ttl: 300,
  }),
  otp: otpSendConsole,
  webauthn: {
    rpId: "example.com",
    rpName: "My App",
  },
});

// Request OTP
await auth.requestOtp("user@example.com");

// Verify OTP → { valid }
const { valid } = await auth.verifyOtp("user@example.com", "123456");

// Create registration token (after app upserts user)
const { registrationToken } = await auth.createRegistrationToken(
  userId,
  "user@example.com",
);

// Passkey registration...
// Passkey authentication...

// Get session from token
const session = await auth.getSession(token);

// Sign out
await auth.deleteSession(token);
```

## Adapter pattern

You provide adapters (typed callbacks), the library orchestrates them. No database coupling — the library never receives a database client, ORM instance, or connection string. It just calls functions. You implement them with Prisma, Drizzle, raw SQL, a REST API, whatever.

See [SPEC.md](../../SPEC.md) for full documentation.
