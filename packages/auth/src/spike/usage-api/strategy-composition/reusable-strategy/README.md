# Reusable strategy type experiments

> **Status** Runtime experiments complete. A one shot kernel map preserves the builder's strategy type guarantees without an accumulating API. Operation descriptors do not have an assertion free generic projector.

## Acceptance claim

One strategy value must install against two session implementations and preserve each exact creation result.

```ts
const cookieOtp = install(cookieSession, sameOtp);
const headerOtp = install(headerSession, sameOtp);

expectType<CookieSessionResult>(successful(cookieOtp.authenticate(...)).session);
expectType<HeaderSessionResult>(successful(headerOtp.authenticate(...)).session);
```

The operation descriptor proof also covers the intended construction path.

```ts
const cookieAuth = makeAuth({ session: cookieSession })
  .addStrategy("otp", sameOtp);
const headerAuth = makeAuth({ session: headerSession })
  .addStrategy("otp", sameOtp);

expectType<CookieSessionResult>(successful(cookieAuth.strategies.otp.authenticate(...)).session);
expectType<HeaderSessionResult>(successful(headerAuth.strategies.otp.authenticate(...)).session);
```

[`contracts-typecheck.ts`](./contracts-typecheck.ts) proves both forms for operation descriptors and proves direct installation for the `defineStrategy` encoding. The universal result experiment removes the distinction by requiring both mechanisms to return one credential shape.

## Comparison

| Candidate                | Exact distinct session results | Strategy authoring                                        | Runtime projection                          | Current assessment                                           |
| ------------------------ | ------------------------------ | --------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Namespace factory        | Yes                            | Generic function returning its named namespace            | Assertion free object merge                 | Runtime leader                                               |
| Operation descriptors    | Yes                            | Plain object plus operation helpers                       | Requires an assertion or unchecked overload | Type result only                                             |
| `defineStrategy`         | Yes                            | Explicit type template using `this` plus an opaque helper | Assertion free direct mount                 | Too much type ceremony                                       |
| Universal session result | No distinct results by design  | Plain mounted namespace                                   | Assertion free direct mount                 | Rejected unless session design independently converges on it |

## Namespace factory

A reusable strategy receives the narrow kernel and returns its complete named namespace.

```ts
function makeOtpStrategy<Identity extends AuthUser, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return {
    otp: {
      request: requestOtp,
      authenticate: (args) => kernel.authenticate(() => proveOtp(args)),
    },
  };
}

const auth = makeAuth({ session }).addStrategy(makeOtpStrategy);
```

Passing the generic function directly lets TypeScript instantiate it with the builder's concrete session result. Returning the strategy name as part of the object also lets the runtime builder merge generic objects without constructing a computed property. The complete implementation in [`namespace-factory.ts`](./namespace-factory.ts) uses no assertions, overloads, proxies, or descriptor branches.

[`namespace-factory-sandbox.ts`](./namespace-factory-sandbox.ts) executes the same factory against cookie and header sessions. Both the compile time API and runtime value retain the correct result. Extracted methods also work because the installed namespace closes over the kernel rather than depending on `this`.

The main cost is strategy authoring. A reusable factory must state its generic kernel signature and must return its own namespace name. The latter matches `.addStrategy(otp)` and makes duplicate names rejectable.

## Arbitrary namespaces

[`arbitrary-namespace-sandbox.ts`](./arbitrary-namespace-sandbox.ts) installs two independently configured OTP strategies and two independently configured Google OIDC strategies.

```ts
const auth = makeAuth({ session })
  .addStrategy(makeEmailOtpStrategy)
  .addStrategy(makeSmsOtpStrategy)
  .addStrategy(makeGoogleProfileStrategy)
  .addStrategy(makeGoogleCalendarStrategy);
```

The namespace names are ordinary object literal keys returned by each factory. They are not enumerated by core and they do not need to match a strategy kind. The experiment preserves all of these distinctions.

- `emailOtp` and `smsOtp` retain their channel types.
- `googleProfile` and `googleCalendar` both retain `provider: "google"` while preserving different scope tuples.
- All four namespaces retain the configured cookie or header session result.
- A duplicate or colliding namespace is rejected at the `.addStrategy()` call.

The name must be written as a literal property in the factory. A helper shaped like `makeNamedStrategy(name, strategy)` encounters the same computed property limitation as the descriptor projector. User code does not need that helper. An inline factory receives a contextually typed kernel and can choose any literal name without generic annotations.

```ts
const auth = makeAuth({ session }).addStrategy((kernel) => ({
  emailOtp: makeOtpNamespace(kernel, emailOtpConfig),
}));
```

## Kernel map parity

[`kernel-map-sandbox.ts`](./kernel-map-sandbox.ts) replaces incremental installation with one callback that returns the final namespace map.

```ts
const auth = makeAuth({
  session,
  strategies: (kernel) => ({
    ...makeOtpNamespaces(kernel),
    ...makeOidcNamespaces(kernel),
  }),
});
```

The map preserves exact namespace keys, operation arguments, failure unions, current identity, per instance configuration, and session establishment results. The same generic callback produces exact cookie and header auth values. Unconfigured namespaces and invalid namespace values fail statically.

Exact helper results retain their keys through spread. A later property intentionally replaces an earlier spread property and its replacement type wins. `satisfies Record<string, object>` validates without widening. An explicit `Record<string, object>` annotation deliberately widens the keys to `string`, matching ordinary TypeScript object behavior.

The map does not preserve one former builder policy. The fixed builder exposed direct `session.create` only before a strategy was installed. An assertion free one shot constructor cannot vary its runtime session object from the inferred emptiness of a callback result. The kernel map therefore exposes only session reads in this experiment. Bespoke authentication can be an explicit strategy, or session only auth can receive a separate API if it remains a requirement.

## Complete workflow pressure test

[`kernel-map-workflow-sandbox.ts`](./kernel-map-workflow-sandbox.ts) installs complete OTP, passkey, and OIDC shaped namespaces through one reusable map callback.

- OTP request remains public and successful authentication establishes exactly the proven user.
- Passkeys cover sign-up, authentication, adding to the current user, user mismatch, listing, and removal.
- OIDC covers authorization start, callback authentication, current user linking, and signed-out rejection.
- Expected authentication failures establish no session.
- Current user operations establish no new session.
- The same callback retains exact cookie and header session results.

The two-operation kernel remains sufficient. Authentication operations use `authenticate`, while adding, management, and linking use read-only `current`. No strategy receives the session implementation and no additional mechanism-specific kernel capability is required.

## Operation descriptors

A strategy describes the authority of every public operation.

```ts
const otp = {
  request: publicOperation(requestOtp),
  authenticate: authenticationOperation(proveOtp),
} satisfies StrategyDefinition;
```

The kernel projects the final namespace from three categories.

- A public operation receives no session authority and retains its result.
- An authentication operation returns a proven user and the kernel adds the configured session result.
- A current user operation receives the current authenticated user and gains `not_authenticated` in its failure union.

The description is independent of session identity and credential shape. Its types preserve argument values, successful data, expected failures, and the concrete session result without a generic mounted namespace.

[`operation-builder.ts`](./operation-builder.ts) proves that this remains true through `.addStrategy()`. The builder retains the session result from `makeAuth` and applies it to the strategy definition while adding the named namespace. The resulting cookie and header authentication methods are exact and do not contain `unknown`.

This contract also teaches an agent where authority enters each method. That is useful beyond satisfying the compiler. It makes an accidental session creating request method or an arbitrary public userId harder to express.

The cost is that the kernel understands a small fixed taxonomy of operation authority. Complex workflows must decompose cleanly into those categories. Passkey registration and account linking need additional pressure tests before promotion.

The generic runtime projector remains deliberately undeclared. Constructing its mapped result requires TypeScript to correlate every dynamic object key with a conditional operation result. `Object.keys`, `Object.entries`, and `Object.fromEntries` erase that correlation, so an implementation needs an assertion or an overload that creates the same unchecked trust boundary.

A callable descriptor can technically avoid allocation by storing the session on `this`. That changes method extraction behavior and makes a reusable definition depend on invocation binding, so it is not a suitable public auth API.

## defineStrategy

This encoding preserves an arbitrary mounted namespace by representing its relationship to the eventual session type as a type function.

```ts
interface OtpApiTemplate extends StrategyApiTemplate {
  readonly type: OtpNamespace<this["sessionCreateResult"]>;
}

const otp = defineStrategy<OtpApiTemplate>((kernel) => ({
  request: requestOtp,
  authenticate: (args) => kernel.authenticate(() => proveOtp(args)),
}));
```

The type result is exact. The author must nevertheless understand `this` based type application, provide an explicit template argument, and construct the strategy through an opaque helper. A hidden invariant type carrier is also retained on every strategy value so TypeScript can recover the template.

That machinery is acceptable inside a type library but works against the goal that an agent can author a correct custom strategy from the visible contract. It is evidence that exactness is possible, not the recommended public design.

## Universal session result

This encoding chooses one credential envelope for every session implementation. A strategy namespace then has one fixed session result and requires no type application.

The types are simple, but the experiment no longer satisfies the original distinction. Cookie and header mechanisms both appear as `IssuedSessionCredentials`. Any binding specific result must be normalized before it reaches the kernel.

The session work currently preserves a mechanism dependent creation result. Composition should not overturn that ownership decision merely to simplify its own generic types.

## Next proof

The namespace factory and operation descriptor candidates should next be exercised against complete OTP, passkey, and OIDC shaped namespaces. The proof must answer four questions.

1. Can passkey sign up, authentication, adding, listing, and removal use the three categories without an artificial operation split?
2. Can OIDC begin, callback authentication, and current user linking use the same categories?
3. Do invalid factories and definitions fail with errors that point an agent to the incorrect operation?
4. Is the generic factory signature acceptable for reusable custom strategy authors, or should examples favor contextually typed inline factories?

Only after that proof should the generic builder and configuration map comparison resume. The builder remains the likely construction winner because it retains literal names incrementally and rejects known duplicates locally.
