# Example conventions

These rules govern how examples are written. They exist so that examples are
readable for both developers and LLMs, and so that new examples stay consistent.

## Framework-native data fetching

Each framework should use its own data-loading pattern:

- **TanStack Start** — route loaders + `router.invalidate()` after mutations
- **Next.js (App Router)** — server components + `router.refresh()` after mutations
- **Bun (plain React)** — `useAsync` from `@repo/auth-react` (no meta-framework)

Never use `useAsync` in a meta-framework example. It exists only for
environments that lack framework-provided data loading.

## Atoms hide rendering, examples show behavior

UI atoms (`Page`, `Button`, `Header`, `EmailInput`, `OtpInput`, `Toolbar`)
encapsulate Tailwind styling so examples stay focused on auth logic. Atoms are
nouns you can picture — not verbs that hide processes.

Auth flow logic (state machines, server calls, validation, error handling) stays
inline in the example. The reader should see the full flow without looking up
hooks or compound components.

## Hooks for ceremony complexity only

WebAuthn passkey hooks (`usePasskeyRegistration`, `usePasskeyAuthentication`)
are justified — they orchestrate 3-step async ceremonies with the browser
credential API, try/catch, and loading/error state. Inlining them would bury the
example.

OTP flow is inline. It is a simple state machine (email → otp steps) with form
handlers that call server functions directly. This IS the example.

## Shared Zod schemas

Server defines validation schemas (e.g. `requestOtpSchema`, `verifyOtpSchema`).
Client imports and reuses the same schemas for form validation. No separate
client-side regex or validation logic — zero drift between server and client.

## Minimize Tailwind in examples

Push all styling into atoms in `@repo/auth-react`. A small amount of raw
Tailwind is acceptable for one-off layout (e.g. a button group wrapper or
standalone error text), but repeated patterns should become atoms.

## Viewer is app data, not auth

The auth library handles sessions, not user profiles. Examples fetch viewer data
using framework patterns (server components, route loaders, `useAsync`), not
auth-specific hooks. This reinforces the library's boundary: auth proves
identity, your app owns user data.
