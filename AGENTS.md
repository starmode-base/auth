# Agent guidelines

- Use `bun run check` after edits to type check all workspaces

## Development workflow

- Use `SPEC.md` as the source of intent
- Generate code + tests together in small chunks
- Human reviews for: unnecessary complexity, over-engineering, maintainability
- Iterate until tight
- Tests become the true spec — `SPEC.md` is historical documentation of intent

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
- Never export local symbols

## Error handling

- All public API functions return `Result<T>` — never throw
- Use `result.ok()` for success, `result.fail()` for expected failures
- Invariants: Never use type assertions (`as`). Throw instead — surfaces bugs immediately. Comment each invariant `Invariant: reasoning`
- Must prove the error with a test before adding try-catch

## TDD (critical)

- NEVER look at implementation code before writing a test
- Derive expected behavior ONLY from: SPEC, requirements, or asking the user
- Test expectations based on reading code = INVALID test

## Prose style

- Use sentence case, never title case
- Don't use the word "code" with regards to OTP (use "otp")
