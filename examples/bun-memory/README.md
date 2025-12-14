# bun-memory

Minimal auth example using Bun's built-in HTTP server with in-memory adapters.

This example demonstrates that `@starmode/auth` works without any metaframework — just vanilla Bun.

## Run

```bash
bun install
bun dev
```

Open http://localhost:3000

## How it works

1. Enter your email and click "Send OTP"
2. Check your terminal for the OTP code (printed by `otpSendConsole`)
3. Enter the code to authenticate
4. You're signed in — session stored in an HttpOnly cookie

## Files

- `index.ts` — Complete server with auth handler and HTML UI
