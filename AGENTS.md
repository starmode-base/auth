# Agent guidelines

## Commands

- Use `bun run check` after edits to type check all workspaces

## Session start

Read before working, in order:

1. `packages/auth/src/spike/contracts.ts` + `spike/mechanisms.ts`
2. `TODO.md`
3. `SPEC.md`

## Documentation map

- `packages/auth/src/spike/contracts.ts` + `spike/mechanisms.ts` — the contract: the typed API spec. Wins over README and code.
- `SPEC.md` — rationale and dated decision record. Partially stale; never treat it as the contract.
- `TODO.md` — the work queue. Gitignored, local to this machine. Never delete items: mark `[x]` with a resolution note; add new items for follow-on work.
- `packages/auth/README.md` — stale. At promotion it is rewritten from the settled spike and becomes the contract.

At promotion (only after the implementation has proven the contract):

- `/README.md` (root, new) — rationale: philosophy, positioning, security model, dated decisions, absorbed from `SPEC.md`
- `packages/auth/README.md` — contract plus behavioral docs (TTL/session mechanics move here or to a linked docs file)
- `SPEC.md` — deleted once fully dissolved
- Queue moves to issues, or `TODO.md` remains

## Development workflow

- Order of work: types → tests → implementation, in small chunks — one unit at a time
- Design adapter interfaces so the laziest implementation is safe: a no-op adapter may only deny access (fail closed), never grant it. If a lazy adapter could grant access, move that obligation into core or a shipped mechanism.
- Type files are split by layer; file organization mirrors the layers:
  - Contracts — the adapter interfaces, the product. Semantic, never mechanical; core runs on anything satisfying them.
  - Mechanisms — logic shipped as adapters, environment-free. No framework imports, ever.
  - Bindings — environment glue. Zero logic — an if-statement means the logic moves down into a mechanism.
  - Configs — pre-composed config values. Data only — composition plus literals, no functions of their own.

## Quality over speed

This is security-critical code.

- Keep it minimal — more code = more attack surface
- Don't add edge cases that weren't asked for
- Don't over-abstract — abstractions must earn their keep
- Don't add "just in case" code
- Every test should be necessary
- Code should be simple enough to explain in a security audit

## Code style

- Use kebab-case for filenames
- No file extensions in imports
- ESM only, no CommonJS
- TypeScript only, no transpile to JS
- Factories should be prefixed with `make` (e.g., `makeAuth`, `makeMemoryAdapters`)
- No optional parameters and no defaults — anywhere, API or config
- Never export local symbols
- Doc blocks are `/** */`, prose only — never `@param`/`@returns` tags, types carry the signatures
- In contract/spec files doc blocks are spec text — held to completeness, state every constraint the type can't show
- Everywhere else comments are held to necessity — only what code can't express, never narration
- Comment tone: professional library API docs — never design rationale, internal notes, or decision history; those belong in SPEC.md

## Error handling

How methods return (commands, queries, adapters, throws) is specified by the `Result` doc block in the contracts.

- Use `result.ok()` for success, `result.fail()` for expected failures
- Invariants: Never use type assertions (`as`). Throw instead — surfaces bugs immediately. Comment each invariant `Invariant: reasoning`
- Must prove the error with a test before adding try-catch

## TDD (critical)

- NEVER write tests based on implemented code
- ALWAYS write tests based on expected behavior (spec, requirements, user input)
- When unsure about expected behavior, ask the user

## Prose style

- Use sentence case, never title case
- OTP: uppercase in prose, `Otp*`/`otp` in identifiers; never call it a "code"

## Code review instructions

- Look for dead code
- Look for useless assertions in tests
- Look for unnecessary complexity and over-engineering
