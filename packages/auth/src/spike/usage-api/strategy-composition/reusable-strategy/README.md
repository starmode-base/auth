# Reusable strategy type experiments

> **Status** Type experiments complete. Operation descriptors preserve the exact session result through the accumulating builder but have not received a runtime projection proof.

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

| Candidate | Exact distinct session results | Strategy authoring | Kernel contract | Current assessment |
| --- | --- | --- | --- | --- |
| Operation descriptors | Yes | Plain object plus operation helpers | Three semantic operation categories | Leading |
| `defineStrategy` | Yes | Explicit type template using `this` plus an opaque helper | Arbitrary mounted namespace | Too much type ceremony |
| Universal session result | No distinct results by design | Plain mounted namespace | One fixed credential result | Rejected unless session design independently converges on it |

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

The runtime projector remains deliberately undeclared. A production candidate must show that mapping a definition to its namespace stays small and requires no assertions or duplicated strategy specific branches.

## defineStrategy

This encoding preserves an arbitrary mounted namespace by representing its relationship to the eventual session type as a type function.

```ts
interface OtpApiTemplate extends StrategyApiTemplate {
  readonly type: OtpNamespace<this["sessionCreateResult"]>;
}

const otp = defineStrategy<OtpApiTemplate>(kernel => ({
  request: requestOtp,
  authenticate: args => kernel.authenticate(() => proveOtp(args)),
}));
```

The type result is exact. The author must nevertheless understand `this` based type application, provide an explicit template argument, and construct the strategy through an opaque helper. A hidden invariant type carrier is also retained on every strategy value so TypeScript can recover the template.

That machinery is acceptable inside a type library but works against the goal that an agent can author a correct custom strategy from the visible contract. It is evidence that exactness is possible, not the recommended public design.

## Universal session result

This encoding chooses one credential envelope for every session implementation. A strategy namespace then has one fixed session result and requires no type application.

The types are simple, but the experiment no longer satisfies the original distinction. Cookie and header mechanisms both appear as `IssuedSessionCredentials`. Any binding specific result must be normalized before it reaches the kernel.

The session work currently preserves a mechanism dependent creation result. Composition should not overturn that ownership decision merely to simplify its own generic types.

## Next proof

The operation descriptor candidate should next be exercised against complete OTP, passkey, and OIDC shaped namespaces. The proof must answer four questions.

1. Can passkey sign up, authentication, adding, listing, and removal use the three categories without an artificial operation split?
2. Can OIDC begin, callback authentication, and current user linking use the same categories?
3. Can the runtime projector remain generic and assertion free?
4. Do invalid definitions fail with errors that point an agent to the incorrect operation?

Only after that proof should the generic builder and configuration map comparison resume. The builder remains the likely construction winner because it retains literal names incrementally and rejects known duplicates locally.
