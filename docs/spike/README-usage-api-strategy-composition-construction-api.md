# Construction API comparison

> **Status** Active type experiment. No constructor has been selected or promoted.

## Question

Compare the nested one object kernel map with split write and read construction. The comparison is limited to TypeScript inference and overload behavior.

## Candidates

The nested candidate keeps the callback in configuration and overloads one function for write and read construction.

```ts
const auth = makeOverloadedAuth({
  debug: true,
  session,
  strategies,
});
```

The split candidate passes fixed configuration and strategies separately. Read only construction has its own function.

```ts
const auth = makeSplitAuth({ debug: true, session }, strategies);
const reader = makeAuthReader({ debug: true, session: sessionReader });
```

## Evidence

[`contracts-typecheck.ts`](./contracts-typecheck.ts) proves the following behavior.

- Both candidates preserve exact types for direct calls.
- The nested candidate widens the session result to `unknown` when a generic strategy callback is stored inside a named configuration value.
- A malformed named strategy configuration can match the nested candidate's read overload because TypeScript ignores extra properties on named structural values.
- The split candidate preserves the exact session result for named fixed configuration and named generic strategy callback values.
- The split candidate rejects malformed named strategy callbacks without a read overload fallback.
- Both candidates follow ordinary TypeScript excess property behavior. Fresh root properties are rejected while unrelated properties on named fixed configuration values are allowed.
- Strategy method arguments remain exact when stored in variables.

## Boundary

This experiment does not change the active usage API. It does not choose session mechanics, strategy workflows, or namespace factory APIs. Promotion requires an explicit decision after the construction tradeoff is reviewed.
