/** Compile-time comparison of kernel map construction signatures. */

type AuthUser = {
  userId: string;
};

type SessionResolver<Identity extends AuthUser> = {
  resolve: () => Promise<Identity | null>;
};

type SessionReader<Identity extends AuthUser, Capabilities extends object> = {
  kernel: SessionResolver<Identity>;
  capabilities: Capabilities;
};

type SessionAdapter<
  Identity extends AuthUser,
  CreateResult,
  Capabilities extends object,
> = {
  kernel: SessionResolver<Identity> & {
    establish: (userId: string) => Promise<CreateResult>;
  };
  capabilities: Capabilities;
};

type StrategyKernel<Identity extends AuthUser, CreateResult> = {
  authenticate: (userId: string) => Promise<CreateResult>;
  current: () => Promise<Identity | null>;
};

type StrategyNamespaces = Record<string, object>;

type SessionNamespace<
  Identity extends AuthUser,
  Capabilities extends object,
> = Capabilities & {
  get: () => Promise<Identity | null>;
};

type Auth<
  Identity extends AuthUser,
  Capabilities extends object,
  Namespaces extends StrategyNamespaces,
> = {
  session: SessionNamespace<Identity, Capabilities>;
  strategies: Namespaces;
};

type AuthReader<
  Identity extends AuthUser,
  Capabilities extends object,
> = {
  session: SessionNamespace<Identity, Capabilities>;
};

type NestedConfig<
  Identity extends AuthUser,
  CreateResult,
  Capabilities extends object,
  Namespaces extends StrategyNamespaces,
> = {
  debug: boolean;
  session: SessionAdapter<Identity, CreateResult, Capabilities>;
  strategies: (
    kernel: StrategyKernel<Identity, CreateResult>,
  ) => Namespaces;
};

type ReaderConfig<
  Identity extends AuthUser,
  Capabilities extends object,
> = {
  debug: boolean;
  session: SessionReader<Identity, Capabilities>;
};

declare function makeOverloadedAuth<
  Identity extends AuthUser,
  CreateResult,
  Capabilities extends object,
  const Namespaces extends StrategyNamespaces,
>(
  config: NestedConfig<Identity, CreateResult, Capabilities, Namespaces>,
): Auth<Identity, Capabilities, Namespaces>;

declare function makeOverloadedAuth<
  Identity extends AuthUser,
  Capabilities extends object,
>(config: ReaderConfig<Identity, Capabilities>): AuthReader<Identity, Capabilities>;

type SplitConfig<
  Identity extends AuthUser,
  CreateResult,
  Capabilities extends object,
> = {
  debug: boolean;
  session: SessionAdapter<Identity, CreateResult, Capabilities>;
};

declare function makeSplitAuth<
  Identity extends AuthUser,
  CreateResult,
  Capabilities extends object,
  const Namespaces extends StrategyNamespaces,
>(
  config: SplitConfig<Identity, CreateResult, Capabilities>,
  strategies: (
    kernel: StrategyKernel<NoInfer<Identity>, NoInfer<CreateResult>>,
  ) => Namespaces,
): Auth<Identity, Capabilities, Namespaces>;

declare function makeAuthReader<
  Identity extends AuthUser,
  Capabilities extends object,
>(config: ReaderConfig<Identity, Capabilities>): AuthReader<Identity, Capabilities>;

type Identity = AuthUser & {
  role: "member";
};

type CreatedSession = {
  cookie: "created";
};

type Capabilities = {
  end: () => Promise<void>;
};

type OtpNamespace<CreateResult> = {
  authenticate: (args: { identifier: string; otp: string }) => Promise<CreateResult>;
};

declare const session: SessionAdapter<Identity, CreatedSession, Capabilities>;
declare const sessionReader: SessionReader<Identity, Capabilities>;

declare function makeOtpNamespace<
  CurrentIdentity extends AuthUser,
  CreateResult,
>(
  kernel: StrategyKernel<CurrentIdentity, CreateResult>,
): OtpNamespace<CreateResult>;

function makeStrategies<
  CurrentIdentity extends AuthUser,
  CreateResult,
>(kernel: StrategyKernel<CurrentIdentity, CreateResult>) {
  return {
    emailOtp: makeOtpNamespace(kernel),
  };
}

function expectType<T>(value: T): T {
  return value;
}

const directNestedAuth = makeOverloadedAuth({
  debug: true,
  session,
  strategies: makeStrategies,
});

expectType<OtpNamespace<CreatedSession>>(
  directNestedAuth.strategies.emailOtp,
);

const storedNestedConfiguration = {
  debug: true,
  session,
  strategies: makeStrategies,
};

const storedNestedAuth = makeOverloadedAuth(storedNestedConfiguration);

expectType<OtpNamespace<unknown>>(storedNestedAuth.strategies.emailOtp);

// @ts-expect-error The stored nested callback lost the concrete session result.
expectType<OtpNamespace<CreatedSession>>(storedNestedAuth.strategies.emailOtp);

const obsoleteConfiguration = {
  debug: true,
  session,
  strategies: {
    emailOtp: {},
  },
};

const obsoleteAuth = makeOverloadedAuth(obsoleteConfiguration);

expectType<AuthReader<Identity, Capabilities>>(obsoleteAuth);

// @ts-expect-error The malformed configuration fell through to the reader overload.
void obsoleteAuth.strategies;

const primitiveNestedConfiguration = {
  debug: true,
  session,
  strategies: () => ({ invalid: 1 }),
};

const primitiveNestedAuth = makeOverloadedAuth(primitiveNestedConfiguration);

expectType<AuthReader<Identity, Capabilities>>(primitiveNestedAuth);

// @ts-expect-error The primitive namespace fell through to the reader overload.
void primitiveNestedAuth.strategies;

// @ts-expect-error Fresh root properties are rejected.
void makeOverloadedAuth({
  debug: true,
  session,
  strategies: makeStrategies,
  unrelatedApplicationValue: true,
});

const namedNestedConfigurationWithExtra = {
  debug: true,
  session,
  strategies: makeStrategies,
  unrelatedApplicationValue: true,
};

void makeOverloadedAuth(namedNestedConfigurationWithExtra);

const namedFixedConfiguration = {
  debug: true,
  session,
  unrelatedApplicationValue: true,
};

const splitAuth = makeSplitAuth(namedFixedConfiguration, makeStrategies);

expectType<OtpNamespace<CreatedSession>>(splitAuth.strategies.emailOtp);

// @ts-expect-error The strategy callback is a separate required argument.
void makeSplitAuth(obsoleteConfiguration);

// @ts-expect-error Strategies must be constructed from the kernel callback.
void makeSplitAuth({ debug: true, session }, { emailOtp: {} });

const primitiveStrategies = () => ({ invalid: 1 });

// @ts-expect-error Every public namespace must be an object.
void makeSplitAuth(namedFixedConfiguration, primitiveStrategies);

void makeSplitAuth(
  {
    debug: true,
    session,
    // @ts-expect-error Fresh root properties are rejected.
    unrelatedApplicationValue: true,
  },
  makeStrategies,
);

const readAuth = makeAuthReader({ debug: true, session: sessionReader });

expectType<AuthReader<Identity, Capabilities>>(readAuth);

// @ts-expect-error A reader has no strategy map.
void readAuth.strategies;

// @ts-expect-error Read-only construction cannot install strategies.
void makeSplitAuth({ debug: true, session: sessionReader }, makeStrategies);

const invalidOtpArguments = {
  identifier: "person@example.com",
  otp: 123456,
};

// @ts-expect-error Namespace arguments remain exact when stored in variables.
void splitAuth.strategies.emailOtp.authenticate(invalidOtpArguments);
