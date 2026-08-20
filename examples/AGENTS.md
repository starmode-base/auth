# Example conventions

These rules govern how examples are written. They exist so that examples are readable for both developers and LLMs, and so that new examples stay consistent.

## Example organization

Examples are organized in two levels: **framework** (folder) → **flow + storage** (example). Framework is the primary dimension because developers start with their stack, then pick an auth flow.

```
examples/
  tanstack-start-react/       TanStack Start with React
  nextjs/                     Next.js (App Router)
  bun-react/                  Bun with React (no meta-framework)
```

Inside each framework folder, examples are named `{flow}-{storage}`:

- Flows: `otp`, `passkey`, `otp-passkey`, `otp-passkey-strict`, `passkey-otp`
- Storage: `memory`, `postgres`

Example: `examples/tanstack-start-react/otp-postgres/`

The `-react` suffix appears where the platform supports multiple renderers (TanStack Start → future SolidJS) or doesn't imply one (Bun). Next.js is always React, so no suffix.

### Example matrix

| Flow                          | `tanstack-start-react` | `nextjs` | `bun-react` |
| ----------------------------- | ---------------------- | -------- | ----------- |
| `otp-memory`                  | ✅                     | ✅       | ✅          |
| `otp-postgres`                | —                      | —        | —           |
| `passkey-memory`              | ✅                     | —        | —           |
| `passkey-postgres`            | —                      | —        | —           |
| `otp-passkey-memory`          | —                      | —        | —           |
| `otp-passkey-postgres`        | —                      | —        | —           |
| `otp-passkey-strict-memory`   | —                      | —        | —           |
| `otp-passkey-strict-postgres` | —                      | —        | —           |
| `passkey-otp-memory`          | —                      | —        | —           |
| `passkey-otp-postgres`        | —                      | —        | —           |

✅ = done, — = planned

### Legacy examples (delete when covered)

These live in `tmp/` and use older patterns:

- `tmp/tanstack-start` — full OTP → passkey, uses `authClient` direct and local atoms. Replaced by `tanstack-start-react/otp-passkey-memory`.
- `tmp/bun-memory` — minimal in-memory test. Delete anytime.

## Framework-native data fetching

Each framework should use its own data-loading pattern:

- **TanStack Start** — route loaders + `router.invalidate()` after mutations
- **Next.js (App Router)** — server components + `router.refresh()` after mutations
- **Bun (plain React)** — `useAsync` from `@repo/auth-react` (no meta-framework)

Never use `useAsync` in a meta-framework example. It exists only for environments that lack framework-provided data loading.

## Framework notes

Platform facts that shape auth integration per framework:

- **TanStack Start** — server functions carry the flows and own cookie access.
- **Next.js (App Router)** — RSC render is read only. `cookies()` is ambient and request scoped. Writes happen in server actions and route handlers.
- **Bun (plain React)** — manual request and response, the framework free floor.
- **Convex** — `ctx` arrives per invocation. Functions cannot set cookies, so auth HTTP goes through proxy routes. Queries are read only, so identity checks there use the session mechanism's read directly. `crypto.subtle` works in queries, mutations, and actions. `fetch` is actions only. Convex Components sit at the adapter layer as storage packaging behind isolated tables with the engine host side. Component writes commit as sub transactions of the host mutation, and table isolation surfaces management as session capabilities.

## Atoms hide rendering, examples show behavior

UI atoms (`Page`, `Button`, `Header`, `EmailInput`, `OtpInput`, `Toolbar`) encapsulate Tailwind styling so examples stay focused on auth logic. Atoms are nouns you can picture — not verbs that hide processes.

Auth flow logic (state machines, server calls, validation, error handling) stays inline in the example. The reader should see the full flow without looking up hooks or compound components.

## Hooks for ceremony complexity only

WebAuthn passkey hooks (`usePasskeyRegistration`, `usePasskeyAuthentication`) are justified — they orchestrate 3-step async ceremonies with the browser credential API, try/catch, and loading/error state. Inlining them would bury the example.

OTP flow is inline. It is a simple state machine (email → otp steps) with form handlers that call server functions directly. This IS the example.

## Shared Zod schemas

Server defines validation schemas (e.g. `requestOtpSchema`, `verifyOtpSchema`). Client imports and reuses the same schemas for form validation. No separate client-side regex or validation logic — zero drift between server and client.

## Minimize Tailwind in examples

Push all styling into atoms in `@repo/auth-react`. A small amount of raw Tailwind is acceptable for one-off layout (e.g. a button group wrapper or standalone error text), but repeated patterns should become atoms.

## Viewer is app data, not auth

The auth library handles sessions, not user profiles. Examples fetch viewer data using framework patterns (server components, route loaders, `useAsync`), not auth-specific hooks. This reinforces the library's boundary: auth proves identity, your app owns user data.
