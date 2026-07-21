---
name: test-one
description: Write exactly one approved behavioral test for one contract unit, run it, and stop before implementation. Use after test planning when the user has selected a claim.
---

# Test one

Turn one approved behavioral claim into one reviewable test.

## Scope

1. Require one target contract unit and one claim explicitly supplied or
   approved by the user. If either is absent or ambiguous, ask before working.
2. Stay within that claim. Do not add adjacent cases, refactor unrelated tests,
   or change production code.
3. If no authority determines the expected behavior, stop and ask rather than
   inventing it.

## Before writing

State briefly:

- The selected behavioral claim.
- The test oracle.
- Where the test will live.
- Why existing tests do not already prove it.

Derive the test oracle from an authority, never from the implementation under
test.

The user's claim approval is the authorization to proceed; do not add another
approval gate unless expected behavior is unclear.

## Write the test

- Follow the test-organization and style rules in `AGENTS.md`.
- Add exactly one `test` or `test.each` declaration.
- Use `test.each` only when every named case is equivalent evidence for the same
  claim.
- Match the target file's established behavioral grouping.
- Keep setup local and deterministic.
- Assert the exact public outcome.
- Use scenario comments when a non-obvious transition or sequence matters to
  the claim; state intent, not obvious mechanics.

Do not edit contracts, production code, unrelated tests, or work-queue files.

## Verify

Run the narrowest command that executes the new test.

- Fix test syntax, typing, or setup errors until the test reaches the selected
  behavior.
- If it fails for the expected behavioral reason, report it as red.
- If it passes immediately, report it as green on arrival; do not weaken the
  test or change production code to force red.
- If another failure prevents the selected behavior from being reached, report
  the blocker without expanding scope.

## Output

Report:

```text
Claim: <selected claim>
Oracle: <expected result or decision rule>
Test: <file and test name>
Result: <red, green on arrival, or blocked> — <reason>
Command: <narrow command>
```

Stop after reporting so the user can review the test before implementation.
