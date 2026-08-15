/**
 * Compile time comparison of the open builder and configuration map.
 *
 * Both candidates install the same reusable strategy values and must preserve
 * the same public namespaces, session result, identity, and failure unions.
 */
import type {
  AuthStrategy,
  AuthSurface,
  AuthUser,
  Result,
  SessionPort,
  StrategyKernel,
  StrategyMap,
} from "./contracts";
import type { StrategyBuilder } from "./builder";
import { makeAuth as makeBuilderAuth } from "./builder";
import type { ConfigurationAuth } from "./configuration-map";
import { makeAuth as makeConfigurationAuth } from "./configuration-map";

type SessionIdentity = AuthUser & {
  role: "member";
};

type CreatedSession = {
  accessToken: "created";
};

type OtpUser = AuthUser & {
  isNew: boolean;
};

type OtpNamespace<SessionCreateResult> = {
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
  authenticate: (args: { identifier: string; otp: string }) => Promise<
    Result<
      {
        user: OtpUser;
        session: SessionCreateResult;
      },
      "invalid_otp" | "authentication_disabled"
    >
  >;
};

type PasskeyNamespace<SessionCreateResult> = {
  createAuthenticationOptions: () => Promise<
    Result<PublicKeyCredentialRequestOptionsJSON, never>
  >;
  verifyAuthentication: (args: {
    credential: AuthenticationResponseJSON;
  }) => Promise<
    Result<
      {
        userId: string;
        session: SessionCreateResult;
      },
      "credential_not_found" | "verification_failed"
    >
  >;
};

type OidcNamespace<Provider extends string, SessionCreateResult> = {
  begin: () => Promise<{ authorizationUrl: string }>;
  callback: (args: { callbackUrl: string }) => Promise<
    Result<
      {
        provider: Provider;
        userId: string;
        session: SessionCreateResult;
      },
      "invalid_state" | "authentication_failed"
    >
  >;
};

type CustomNamespace<Identity extends AuthUser> = {
  inspectCurrent: () => Promise<Identity | null>;
};

type OtpStrategy = AuthStrategy<
  SessionIdentity,
  CreatedSession,
  OtpNamespace<CreatedSession>
>;
type PasskeyStrategy = AuthStrategy<
  SessionIdentity,
  CreatedSession,
  PasskeyNamespace<CreatedSession>
>;
type OidcStrategy<Provider extends string> = AuthStrategy<
  SessionIdentity,
  CreatedSession,
  OidcNamespace<Provider, CreatedSession>
>;
type CustomStrategy = AuthStrategy<
  SessionIdentity,
  CreatedSession,
  CustomNamespace<SessionIdentity>
>;

declare const session: SessionPort<SessionIdentity, CreatedSession>;
declare const otp: OtpStrategy;
declare const passkey: PasskeyStrategy;
declare const google: OidcStrategy<"google">;
declare const microsoft: OidcStrategy<"microsoft">;
declare const custom: CustomStrategy;

function expectType<T>(value: T): T {
  return value;
}

/* The builder accumulates exact namespaces without enumerated states. */

const builderSessionOnly = makeBuilderAuth({ debug: true, session });
const builderOtp = builderSessionOnly.addStrategy("otp", otp);
const builderOtpGoogle = builderOtp.addStrategy("google", google);
const builderGoogleOtp = builderSessionOnly
  .addStrategy("google", google)
  .addStrategy("otp", otp);

expectType<Promise<CreatedSession>>(
  builderSessionOnly.session.create({ userId: "user-1" }),
);
expectType<Promise<SessionIdentity | null>>(builderSessionOnly.session.get());
expectType<OtpNamespace<CreatedSession>>(builderOtp.strategies.otp);
expectType<OidcNamespace<"google", CreatedSession>>(
  builderOtpGoogle.strategies.google,
);

// @ts-expect-error Direct creation is reserved to session only auth.
void builderOtp.session.create;

// @ts-expect-error Google was not installed on this builder value.
void builderOtp.strategies.google;

// @ts-expect-error An installed strategy name cannot be added again.
void builderOtp.addStrategy("otp", otp);

// @ts-expect-error Every installed value must be a complete strategy.
void builderSessionOnly.addStrategy("invalid", {});

type OtpGoogleNamespaces = {
  otp: OtpNamespace<CreatedSession>;
  google: OidcNamespace<"google", CreatedSession>;
};

expectType<
  StrategyBuilder<SessionIdentity, CreatedSession, OtpGoogleNamespaces>
>(builderOtpGoogle);
expectType<
  StrategyBuilder<SessionIdentity, CreatedSession, OtpGoogleNamespaces>
>(builderGoogleOtp);

/* Strategy specific session data and failure unions survive installation. */

const builderOtpResult = builderOtp.strategies.otp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
});

expectType<
  Promise<
    Result<
      {
        user: OtpUser;
        session: CreatedSession;
      },
      "invalid_otp" | "authentication_disabled"
    >
  >
>(builderOtpResult);

const builderGoogleResult = builderOtpGoogle.strategies.google.callback({
  callbackUrl: "https://app.example.com/auth/callback",
});

expectType<
  Promise<
    Result<
      {
        provider: "google";
        userId: string;
        session: CreatedSession;
      },
      "invalid_state" | "authentication_failed"
    >
  >
>(builderGoogleResult);

/* Multiple instances of one strategy kind remain distinct by name and type. */

const builderProviders = builderSessionOnly
  .addStrategy("google", google)
  .addStrategy("microsoft", microsoft);

expectType<OidcNamespace<"google", CreatedSession>>(
  builderProviders.strategies.google,
);
expectType<OidcNamespace<"microsoft", CreatedSession>>(
  builderProviders.strategies.microsoft,
);

/* An unfamiliar third party namespace needs no core type change. */

const builderCustom = builderSessionOnly.addStrategy("custom", custom);
expectType<Promise<SessionIdentity | null>>(
  builderCustom.strategies.custom.inspectCurrent(),
);

/*
 * A strategy with a generic mount loses the session result during collection.
 * Both candidates expose this limitation rather than claiming false parity
 * with the fixed usage API.
 */

type ReusableOtpStrategy = {
  mount: <Identity extends AuthUser, SessionCreateResult>(
    kernel: StrategyKernel<Identity, SessionCreateResult>,
  ) => OtpNamespace<SessionCreateResult>;
};

declare const reusableOtp: ReusableOtpStrategy;

const builderReusableOtp = builderSessionOnly.addStrategy(
  "reusableOtp",
  reusableOtp,
);

expectType<OtpNamespace<unknown>>(builderReusableOtp.strategies.reusableOtp);

const configurationReusableOtp = makeConfigurationAuth({
  debug: true,
  session,
  strategies: {
    reusableOtp,
  },
});

expectType<OtpNamespace<unknown>>(
  configurationReusableOtp.strategies.reusableOtp,
);

/* A direct configuration map preserves the same exact namespaces. */

const configurationSessionOnly = makeConfigurationAuth({
  debug: true,
  session,
  strategies: {},
});
const configurationOtpGoogle = makeConfigurationAuth({
  debug: true,
  session,
  strategies: {
    otp,
    google,
  },
});

expectType<Promise<CreatedSession>>(
  configurationSessionOnly.session.create({ userId: "user-1" }),
);
expectType<OtpNamespace<CreatedSession>>(configurationOtpGoogle.strategies.otp);
expectType<OidcNamespace<"google", CreatedSession>>(
  configurationOtpGoogle.strategies.google,
);

// @ts-expect-error Direct creation is hidden by a nonempty strategy map.
void configurationOtpGoogle.session.create;

// @ts-expect-error Passkeys were not installed in this map.
void configurationOtpGoogle.strategies.passkey;

void makeConfigurationAuth({
  debug: true,
  session,
  strategies: {
    // @ts-expect-error Every map value must be a complete strategy.
    invalid: {},
  },
});

/* satisfies checks every value without widening the literal strategy names. */

const checkedStrategies = {
  otp,
  google,
} satisfies StrategyMap<SessionIdentity, CreatedSession>;

const checkedConfiguration = makeConfigurationAuth({
  debug: true,
  session,
  strategies: checkedStrategies,
});

expectType<OtpNamespace<CreatedSession>>(checkedConfiguration.strategies.otp);

// @ts-expect-error satisfies preserved the known names.
void checkedConfiguration.strategies.notInstalled;

/* A broad annotation deliberately loses exact strategy name information. */

const widenedStrategies: StrategyMap<SessionIdentity, CreatedSession> = {
  otp,
  google,
};

const widenedConfiguration = makeConfigurationAuth({
  debug: true,
  session,
  strategies: widenedStrategies,
});

expectType<object | undefined>(widenedConfiguration.strategies.notInstalled);

/* Both candidates project the same shared public auth surface. */

expectType<AuthSurface<SessionIdentity, CreatedSession, OtpGoogleNamespaces>>(
  builderOtpGoogle,
);
expectType<AuthSurface<SessionIdentity, CreatedSession, OtpGoogleNamespaces>>(
  configurationOtpGoogle,
);

expectType<
  ConfigurationAuth<
    SessionIdentity,
    CreatedSession,
    {
      otp: OtpStrategy;
      google: OidcStrategy<"google">;
    }
  >
>(configurationOtpGoogle);

/* Root configuration remains complete and exact. */

// @ts-expect-error debug remains required for the builder.
void makeBuilderAuth({ session });

// @ts-expect-error strategies remains required for the map.
void makeConfigurationAuth({ debug: true, session });

void makeBuilderAuth({
  debug: true,
  session,
  // @ts-expect-error Unknown root configuration is rejected.
  unknown: true,
});

void makeConfigurationAuth({
  debug: true,
  session,
  strategies: {},
  // @ts-expect-error Unknown root configuration is rejected.
  unknown: true,
});

/* The passkey namespace remains an arbitrary strategy specific shape. */

const builderPasskey = builderSessionOnly.addStrategy("passkey", passkey);
expectType<PasskeyNamespace<CreatedSession>>(builderPasskey.strategies.passkey);
