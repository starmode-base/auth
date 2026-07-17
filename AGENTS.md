# Agent guidelines

- Use `bun run check` after edits to type check all workspaces

## Development workflow

- Use `packages/auth/README.md` as the source of intent — it documents the target API and wins over code
- Order of work: types (signatures) → tests → implementation. Signatures make the contract concrete, tests encode it, implementation satisfies it.
- When designing an adapter interface, ask what the lazy implementation does — it must fail closed (deny access), never open
- Type files are split by layer (see SPEC.md "Adapter layering"): contracts, mechanisms, bindings, configs — file organization mirrors the layers
- Generate code + tests together in small chunks
- Human reviews for: unnecessary complexity, over-engineering, maintainability
- Iterate until tight
- Tests become the true spec — the README is the contract they encode

## Documentation map

Roles (decided 2026-07-16): README = contract, SPEC = rationale, TODO = queue.

Now:

- `packages/auth/README.md` — the contract: target API, drives implementation. Where it disagrees with the code, the README wins.
- `SPEC.md` — rationale and dated decision record. Partially stale; never treat it as the contract.
- `TODO.md` — work queue from the 2026-07 repo review. Deliberately uncommitted.

Destination (hold until the contract is finished and proven by the builder factory implementation):

- `/README.md` (root, new) — rationale: philosophy, positioning, security model, dated decisions, absorbed from `SPEC.md`
- `packages/auth/README.md` — contract plus behavioral docs (TTL/session mechanics move here or to a linked docs file)
- `SPEC.md` — deleted once fully dissolved
- Queue moves to issues, or `TODO.md` remains

Don't start the doc reorganization ahead of that milestone — SPEC content can't be sorted into rationale vs behavioral docs until the contract settles.

## Quality over speed

This is security-critical code.

- Keep it minimal — more code = more attack surface
- Don't add edge cases that weren't asked for
- Don't over-abstract — abstractions must earn their keep
- Don't add "just in case" code
- Match the style and conventions already in the codebase
- Every test should be necessary — don't test unlikely edge cases
- Code should be simple enough to explain in a security audit

## Code style

- Use kebab-case for filenames
- No file extensions in imports
- ESM only, no CommonJS
- TypeScript only, no transpile to JS
- Factories should be prefixed with `make` (e.g., `makeAuth`, `makeMemoryAdapters`)
- No optional parameters and no defaults — anywhere, API or config (decided 2026-07-17). Noisier but more distinct. May be reconsidered later; not now.
- Never export local symbols
- Use TS/JS style comments
- Comments (decided 2026-07-17): doc blocks (`/** */`, prose only — never `@param`/`@returns` tags, types carry the signatures) in contract/spec files are spec text — held to completeness, state every constraint the type can't show. Everywhere else comments are held to necessity — only what code can't express, never narration. Tone: professional library API docs — never design rationale, internal notes, or decision history; those belong in SPEC.md.

## Error handling

The mental model (decided 2026-07-17): three channels, one rule per kind of function.

- Commands (public API methods that do something) return `Result<T, E>` with a narrowed per-method error union — expected failures are values, including malformed client input. `E = never` collapses the type to an always-success envelope, so no dead error branches.
- Queries (public API lookups) return the value or `null` — absence is not failure. Currently only `session.get`.
- Adapter interfaces (SPI) return plain values/null — the envelope is how the library speaks, not how it listens.
- Infrastructure failures throw, everywhere — they are breakage, not outcomes. Throws are for the error monitor; Results are for the user.
- The library never throws as flow control — no auth flow requires try/catch. Every shipped wire layer converts throws to error envelopes (500 + `internal_error`).
- Use `result.ok()` for success, `result.fail()` for expected failures
- Invariants: Never use type assertions (`as`). Throw instead — surfaces bugs immediately. Comment each invariant `Invariant: reasoning`
- Must prove the error with a test before adding try-catch

## TDD (critical)

- NEVER write tests based on implemented code
- ALWAYS write tests based on expected behavior (spec, requirements, user input)
- When unsure about expected behavior, ask the user

## Prose style

- Use sentence case, never title case
- Don't use the word "code" with regards to OTP (use "otp")

## Code review instructions

- Look for dead code
- Look for useless assertions in tests
