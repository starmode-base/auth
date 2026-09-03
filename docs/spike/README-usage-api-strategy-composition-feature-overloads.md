# Feature overload comparison

> **Status** Active type experiment. It does not change the active usage API.

## Question

Compare a factory whose overloads infer the returned API from fixed `otp` and `passkey` configuration keys with one kernel map signature that accepts arbitrary namespace names.

The current `main` branch requires one full configuration and is not overloaded. This experiment recreates the earlier design pattern rather than copying the current implementation.

## Overloaded factory

```ts
const auth = makeOverloadedAuth({
  session,
  otp,
  passkey,
});
```

The overload set contains session only, OTP, passkey, and combined configurations. It returns a different API for each combination.

[`overloaded-factory-typecheck.ts`](./overloaded-factory-typecheck.ts) proves that valid fresh literals infer the intended result. It also demonstrates the loss at a named structural value.

```ts
const config = {
  session,
  otp,
  passkey: 123,
};

const auth = makeOverloadedAuth(config);
```

The combined overload rejects `passkey`, but the OTP overload accepts the named object and ignores `passkey` as an extra property. The call compiles as OTP only. If both feature values are invalid, the session only overload accepts the named object.

The implementation signature is not responsible because callers cannot see it. The loss comes from overlapping public overloads combined with structural typing for named values.

## Kernel map

```ts
const auth = makeKernelMapAuth({
  session,
  strategies: (kernel) => ({
    emailOtp: makeOtpNamespace(kernel, otp),
    passkeys: makePasskeyNamespace(kernel, passkey),
  }),
});
```

[`kernel-map-typecheck.ts`](./kernel-map-typecheck.ts) proves that one signature retains exact arbitrary names and has no narrower feature overload that can ignore an invalid namespace value. Fresh root properties are rejected. Named configuration values may carry unrelated root properties under ordinary structural typing.

## Boundary

This comparison covers only feature combination overloads and excess property behavior. Read only construction and generic session result inference remain separate questions in [`../construction-api/`](../construction-api/).
