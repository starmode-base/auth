/** Compile-time evidence for one arbitrary kernel map signature. */
import type {
  KernelMapAuth,
  OtpConfig,
  OtpNamespace,
  PasskeyConfig,
  PasskeyNamespace,
  SessionConfig,
  StrategyKernel,
  StrategyNamespaces,
} from "./contracts";
import { makeOtpNamespace, makePasskeyNamespace } from "./contracts";

type KernelMapConfig<Namespaces extends StrategyNamespaces> = {
  debug: boolean;
  session: SessionConfig;
  strategies: (kernel: StrategyKernel) => Namespaces;
};

declare function makeKernelMapAuth<const Namespaces extends StrategyNamespaces>(
  config: KernelMapConfig<Namespaces>,
): KernelMapAuth<Namespaces>;

declare const session: SessionConfig;
declare const emailOtp: OtpConfig;
declare const smsOtp: OtpConfig;
declare const passkey: PasskeyConfig;

function expectType<T>(value: T): T {
  return value;
}

const auth = makeKernelMapAuth({
  debug: true,
  session,
  strategies: (kernel) => ({
    emailOtp: makeOtpNamespace(kernel, emailOtp),
    smsOtp: makeOtpNamespace(kernel, smsOtp),
    passkeys: makePasskeyNamespace(kernel, passkey),
  }),
});

expectType<OtpNamespace>(auth.strategies.emailOtp);
expectType<OtpNamespace>(auth.strategies.smsOtp);
expectType<PasskeyNamespace>(auth.strategies.passkeys);

// @ts-expect-error An unconfigured namespace is unavailable.
void auth.strategies.google;

const primitiveStrategies = () => ({ invalid: 123 });

const invalidNamedConfiguration = {
  debug: true,
  session,
  strategies: primitiveStrategies,
};

// @ts-expect-error There is no narrower overload that can ignore the invalid namespace.
void makeKernelMapAuth(invalidNamedConfiguration);

const namedConfigurationWithExtra = {
  debug: true,
  session,
  strategies: (kernel: StrategyKernel) => ({
    emailOtp: makeOtpNamespace(kernel, emailOtp),
  }),
  unrelatedApplicationValue: true,
};

const namedAuth = makeKernelMapAuth(namedConfigurationWithExtra);

expectType<OtpNamespace>(namedAuth.strategies.emailOtp);

void makeKernelMapAuth({
  debug: true,
  session,
  strategies: () => ({}),
  // @ts-expect-error Fresh unrelated root properties are rejected.
  unrelatedApplicationValue: true,
});

const invalidOtpArguments = {
  identifier: "person@example.com",
  otp: 123456,
};

// @ts-expect-error Namespace arguments remain exact when stored in variables.
void auth.strategies.emailOtp.authenticate(invalidOtpArguments);
