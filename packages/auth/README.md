# @starmode/auth

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
  otpEmailMinimal,
  otpSendConsole,
  makeSessionTokenJwt,
} from "@starmode/auth";

const auth = makeAuth({
  ...makeMemoryAdapters(),
  ...makeSessionTokenJwt({ secret: process.env.SESSION_SECRET!, ttl: 600 }),
  email: otpEmailMinimal,
  send: otpSendConsole,
});

// Request OTP
await auth.requestOtp("user@example.com");

// Verify OTP (creates user + session)
const { valid, userId, token } = await auth.verifyOtp(
  "user@example.com",
  "123456",
);

// Get session from token
const session = await auth.getSession(token);

// Sign out
await auth.deleteSession(token);
```

## Adapter pattern

You provide adapters (typed callbacks), the library orchestrates them. No database coupling whatsoever — the library never receives a database client, ORM instance, connection string, or knowledge of your schema. It just calls functions. You implement them with Prisma, Drizzle, raw SQL, a REST API, whatever — the library doesn't know or care.

### Creating adapter factories

Adapters can be provided individually or grouped into factories. Use factories when:

1. **Adapters are tightly coupled** — they share configuration (e.g., JWT encode/decode share the same secret)
2. **Adapters share dependencies** — they use the same database pool, API client, etc.

```ts
// Tightly coupled: encode/decode must use same secret
const { encodeSessionToken, decodeSessionToken } = makeSessionTokenJwt({
  secret: "my-secret",
  ttl: 600,
});

// Shared dependency: all use the same db pool
const dbAdapters = (pool: Pool) => ({
  storeOtp: async (email, code, expiresAt) => {
    await pool.query("INSERT INTO otps ...", [email, code, expiresAt]);
  },
  verifyOtp: async (email, code) => {
    const result = await pool.query("SELECT ... FROM otps ...", [email, code]);
    return result.rows.length > 0;
  },
  // ... other db adapters
});

// Combine with spread
const auth = makeAuth({
  ...dbAdapters(pool),
  ...makeSessionTokenJwt({ secret, ttl }),
  email: otpEmailMinimal,
  send: otpSendResend({ apiKey }),
});
```

This pattern lets you:

- Swap entire groups of adapters at once
- Keep related configuration together
- Build reusable adapter packages for common setups (Postgres, Drizzle, Prisma, etc.)
