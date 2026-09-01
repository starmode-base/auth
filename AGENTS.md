# Agent guidelines

## Commands

- Use `bun run check` after edits to type check all workspaces

## Session start

Read before working, in order:

1. `packages/auth2/src/contracts.ts` + `packages/auth2/README.md`
2. `TODO.md`
3. `SPEC.md`

## Documentation map

- `packages/auth2/src/contracts.ts` — the contract: the typed API spec. Wins over README and code.
- `packages/auth2/README.md` — the settled construction, session split, and signed-session design record, with the compile-time proofs it links.
- `SPEC.md` — rationale and decision record. Partially stale; never treat it as the contract.
- `docs/spike/` — design records moved unedited from the retired spike. auth2 wins where they disagree. Folding them into the documentation is pending.
- `TODO.md` — the work queue. Gitignored, local to this machine. Never delete items: mark `[x]` with a resolution note; add new items for follow-on work.
- `packages/auth/README.md` — stale. At promotion it is rewritten from the settled spike and becomes the contract.

At promotion (only after the implementation has proven the contract):

- `/README.md` (root, new) — rationale: philosophy, positioning, security model, dated decisions, absorbed from `SPEC.md`
- `packages/auth/README.md` — contract plus behavioral docs (TTL/session mechanics move here or to a linked docs file)
- `SPEC.md` — deleted once fully dissolved
- Queue moves to issues, or `TODO.md` remains

## Development workflow

- Order of work: types → tests → implementation, in small chunks — one unit at a time
- PoC phase (since 2026-08-22): `packages/auth2` is the build site. Units get tests once a second example uses them unchanged. Examples hand write bindings and client calls. Helpers come only from repetition observed across examples.
- Adapter interfaces are trust boundaries. Core relies on their documented semantics; it does not attempt to compensate for an incorrect custom implementation. Shipped adapters and mechanisms must be tested, and custom adapter authors are responsible for satisfying the contract.
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

## Tests

### Vocabulary

- Authority — the source that determines expected behavior, following the documentation map; e.g. a contract, requirement, governing standard, or user/domain expert
  Example: The contract says a token is expired only when `expiresAt < now`
- Behavioral claim — what must be true
  Example: A token is not expired when `expiresAt === now`
- Test oracle — the expected result or decision rule for a given case
  Example: `expired` is `false`, encoded as `expect(decoded?.token.expired).toBe(false)`

### TDD (critical)

Every test proves one behavioral claim using a test oracle derived from an authority. The implementation under test is never an authority or test oracle. When no authority determines the expected behavior, ask the user.

Place each claim at the lowest contract unit that owns the behavior, and establish required collaborator coverage before wrapper tests. Wrapper tests cover the wrapper's policy, translation, validation, and observable wiring; collaborator conformance belongs in the collaborator's test file. Prove wiring through public outcomes, not internal call counts.

### Organization

- One contract unit per test file; the filename identifies it, so don't repeat it in an outer `describe`
- Group `describe` blocks by the unit's real behavioral concerns or failure modes; reuse sibling group names where they fit, never impose a fixed taxonomy
- Prefer no more than one `describe` level; use an ungrouped `test` when grouping adds no orientation
- Use `test` and `test.each`, not `it`
- Test names state complete behavioral claims using API vocabulary; name the responsible public operation or subject when the group does not
- Use scenario comments when a non-obvious transition or sequence matters to the claim; state intent, never mechanics already clear from the code
- Split multiple public units into separate test files when practical

## Prose style

- Use sentence case, never title case
- Avoid semicolons, colons, and hyphens
- Never hard-wrap prose in Markdown
- OTP: uppercase in prose, `Otp*`/`otp` in identifiers; never call it a "code"
- Tone: professional, design specification style
- The repo is public. Write every document neutral and self-contained, assuming no reader context beyond the repo, and never referencing private conversations, business relationships, or non-public third party plans

## Code review instructions

- Look for dead code
- Look for useless assertions in tests
- Look for unnecessary complexity and over-engineering
