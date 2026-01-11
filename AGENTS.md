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

## Prose style

- Use sentence case, never title case
