---
name: test-plan
description: Plan test coverage for one contract unit at a time. Use when identifying covered, partial, missing, unclear, or out-of-scope behavioral claims before writing tests.
---

# Test plan

Produce a compact assurance inventory for one contract unit. A contract unit is
a public factory, adapter, namespace method, parser, or similarly coherent
behavioral boundary; it is not necessarily one physical file.

## Scope

1. Require the user to name one target contract unit. If the target is absent
   or ambiguous, ask before investigating.
2. Stay within that target. Do not rank gaps across the repository or propose
   work in unrelated modules.
3. Record cross-unit discoveries under `Parked follow-ups` without pursuing
   them.

## Claims and evidence

Gather behavioral claims from the authorities relevant to the target:

1. Requirements supplied by the user.
2. The authoritative contract and mechanism documentation identified by
   `AGENTS.md`.
3. Relevant threat-model decisions and governing standards.

Use the work queue to find known gaps and existing tests to classify evidence.
Existing tests and implementation do not determine expected behavior.

## Inventory

Build the complete behavioral claim inventory for the target, grouped by
domain behavior. Include positive behavior, denial or failure behavior,
boundaries, side effects, time, and concurrency only where the authorities
require them.

Give every claim exactly one status:

- `Covered` — existing evidence directly proves the claim.
- `Partial` — evidence proves only part of the claim.
- `Missing` — the claim has no direct evidence.
- `Unclear` — no authority determines the expected behavior.
- `Out of scope` — an authority explicitly places responsibility elsewhere.

For covered or partial claims, cite the relevant test by name and file. For
missing or partial claims, briefly state the defect the evidence should catch.
Do not invent requirements or add speculative edge cases.

## Output

Use this structure:

```text
Target: <contract unit>

<Behavior group>
- <Status>: <claim>. <Evidence or brief gap reason>

Questions
- <Only genuinely unresolved requirements; omit when empty>

Recommended next test
- <One missing or partial claim and its test oracle, with a short reason; or
  `None` when every claim is covered or otherwise resolved>

Parked follow-ups
- <Cross-unit discovery; omit when empty>
```

Keep each entry concise, but do not cap or sample the inventory. Completeness
is local to the target.

Do not edit files, write test code, or propose implementation. Stop after the
inventory so the user can approve the recommended test target or choose
another.
