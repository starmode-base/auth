import type {
  AuthUser,
  CookieSessionResult,
  HeaderSessionResult,
  Result,
  SessionIdentity,
  SessionPort,
  StrategyKernel,
} from "./contracts";
import { makeAuth } from "./kernel-map";

type OtpUser = AuthUser & {
  identifier: string;
};

type OtpConfig = {
  request: (identifier: string) => Promise<Result<void, never>>;
  prove: (
    identifier: string,
    otp: string,
  ) => Promise<Result<OtpUser, "invalid_otp">>;
};

type OtpNamespace<SessionCreateResult> = {
  request: (args: { identifier: string }) => Promise<Result<void, never>>;
  authenticate: (args: { identifier: string; otp: string }) => Promise<
    Result<
      {
        user: OtpUser;
        session: SessionCreateResult;
      },
      "invalid_otp"
    >
  >;
};

type RegistrationIntent = { kind: "sign-up" } | { kind: "add"; userId: string };

type RegistrationProof = {
  intent: "sign-up" | "add";
  userId: string;
};

type PasskeySummary = {
  credentialId: string;
  label: string;
};

type PasskeyConfig<Summary extends PasskeySummary> = {
  beginRegistration: (
    intent: RegistrationIntent,
  ) => Promise<{ challenge: string }>;
  verifyRegistration: (
    credential: string,
  ) => Promise<
    Result<RegistrationProof, "challenge_expired" | "verification_failed">
  >;
  beginAuthentication: () => Promise<{ challenge: string }>;
  verifyAuthentication: (
    credential: string,
  ) => Promise<
    Result<AuthUser, "credential_not_found" | "verification_failed">
  >;
  list: (userId: string) => Promise<Summary[]>;
  remove: (
    userId: string,
    credentialId: string,
  ) => Promise<Result<void, "credential_not_found">>;
};

type PasskeyNamespace<SessionCreateResult, Summary extends PasskeySummary> = {
  beginSignUp: () => Promise<{ challenge: string }>;
  beginAdd: () => Promise<Result<{ challenge: string }, "not_authenticated">>;
  completeRegistration: (args: { credential: string }) => Promise<
    Result<
      | {
          intent: "sign-up";
          userId: string;
          session: SessionCreateResult;
        }
      | {
          intent: "add";
          userId: string;
        },
      | "challenge_expired"
      | "verification_failed"
      | "not_authenticated"
      | "user_mismatch"
    >
  >;
  beginAuthentication: () => Promise<{ challenge: string }>;
  authenticate: (args: { credential: string }) => Promise<
    Result<
      {
        user: AuthUser;
        session: SessionCreateResult;
      },
      "credential_not_found" | "verification_failed"
    >
  >;
  list: () => Promise<Result<Summary[], "not_authenticated">>;
  remove: (args: {
    credentialId: string;
  }) => Promise<Result<void, "not_authenticated" | "credential_not_found">>;
};

type OidcUser<
  Provider extends string,
  Scopes extends readonly string[],
> = AuthUser & {
  provider: Provider;
  scopes: Scopes;
};

type OidcConfig<Provider extends string, Scopes extends readonly string[]> = {
  provider: Provider;
  scopes: Scopes;
  begin: (
    intent: { kind: "authenticate" } | { kind: "link"; userId: string },
  ) => Promise<{ authorizationUrl: string }>;
  authenticate: (
    callbackUrl: string,
  ) => Promise<
    Result<
      OidcUser<Provider, Scopes>,
      "invalid_state" | "authentication_failed"
    >
  >;
  link: (
    userId: string,
    callbackUrl: string,
  ) => Promise<
    Result<{ providerAccountId: string }, "invalid_state" | "linking_failed">
  >;
};

type OidcNamespace<
  Provider extends string,
  Scopes extends readonly string[],
  SessionCreateResult,
> = {
  begin: () => Promise<{
    authorizationUrl: string;
    provider: Provider;
    scopes: Scopes;
  }>;
  callback: (args: { callbackUrl: string }) => Promise<
    Result<
      {
        user: OidcUser<Provider, Scopes>;
        session: SessionCreateResult;
      },
      "invalid_state" | "authentication_failed"
    >
  >;
  beginLink: () => Promise<
    Result<
      {
        authorizationUrl: string;
        provider: Provider;
        scopes: Scopes;
      },
      "not_authenticated"
    >
  >;
  linkCallback: (args: {
    callbackUrl: string;
  }) => Promise<
    Result<
      { providerAccountId: string },
      "not_authenticated" | "invalid_state" | "linking_failed"
    >
  >;
};

function makeOtpNamespace<Identity extends AuthUser, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: OtpConfig,
): OtpNamespace<SessionCreateResult> {
  return {
    request: ({ identifier }) => config.request(identifier),
    authenticate: ({ identifier, otp }) =>
      kernel.authenticate(() => config.prove(identifier, otp)),
  };
}

function makePasskeyNamespace<
  Identity extends AuthUser,
  SessionCreateResult,
  Summary extends PasskeySummary,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: PasskeyConfig<Summary>,
): PasskeyNamespace<SessionCreateResult, Summary> {
  return {
    beginSignUp: () => config.beginRegistration({ kind: "sign-up" }),
    beginAdd: async () => {
      const identity = await kernel.current();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      const options = await config.beginRegistration({
        kind: "add",
        userId: identity.userId,
      });

      return { success: true, data: options };
    },
    completeRegistration: async ({ credential }) => {
      const registration = await config.verifyRegistration(credential);

      if (!registration.success) {
        return registration;
      }

      if (registration.data.intent === "add") {
        const identity = await kernel.current();

        if (identity === null) {
          return {
            success: false,
            error: "not_authenticated",
          };
        }

        if (identity.userId !== registration.data.userId) {
          return {
            success: false,
            error: "user_mismatch",
          };
        }

        return {
          success: true,
          data: {
            intent: "add",
            userId: registration.data.userId,
          },
        };
      }

      const authentication = await kernel.authenticate<AuthUser, never>(
        async (): Promise<Result<AuthUser, never>> => ({
          success: true,
          data: { userId: registration.data.userId },
        }),
      );

      return {
        success: true,
        data: {
          intent: "sign-up",
          userId: authentication.data.user.userId,
          session: authentication.data.session,
        },
      };
    },
    beginAuthentication: () => config.beginAuthentication(),
    authenticate: ({ credential }) =>
      kernel.authenticate(() => config.verifyAuthentication(credential)),
    list: async () => {
      const identity = await kernel.current();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      return {
        success: true,
        data: await config.list(identity.userId),
      };
    },
    remove: async ({ credentialId }) => {
      const identity = await kernel.current();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      return config.remove(identity.userId, credentialId);
    },
  };
}

function makeOidcNamespace<
  Identity extends AuthUser,
  SessionCreateResult,
  const Provider extends string,
  const Scopes extends readonly string[],
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: OidcConfig<Provider, Scopes>,
): OidcNamespace<Provider, Scopes, SessionCreateResult> {
  return {
    begin: async () => ({
      ...(await config.begin({ kind: "authenticate" })),
      provider: config.provider,
      scopes: config.scopes,
    }),
    callback: ({ callbackUrl }) =>
      kernel.authenticate(() => config.authenticate(callbackUrl)),
    beginLink: async () => {
      const identity = await kernel.current();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      const authorization = await config.begin({
        kind: "link",
        userId: identity.userId,
      });

      return {
        success: true,
        data: {
          ...authorization,
          provider: config.provider,
          scopes: config.scopes,
        },
      };
    },
    linkCallback: async ({ callbackUrl }) => {
      const identity = await kernel.current();

      if (identity === null) {
        return {
          success: false,
          error: "not_authenticated",
        };
      }

      return config.link(identity.userId, callbackUrl);
    },
  };
}

const establishedUserIds: string[] = [];
const removedPasskeys: string[] = [];
const linkedAccounts: string[] = [];

const cookieSession = {
  establish: async (userId) => {
    establishedUserIds.push(userId);

    return {
      cookie: {
        name: "auth",
        value: `cookie:${userId}`,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    };
  },
  current: async () => ({
    userId: "current-user",
    role: "member",
  }),
} satisfies SessionPort<SessionIdentity, CookieSessionResult>;

const headerSession = {
  establish: async (userId) => ({
    accessToken: `access:${userId}`,
    refreshToken: `refresh:${userId}`,
  }),
  current: async () => ({
    userId: "current-user",
    role: "member",
  }),
} satisfies SessionPort<SessionIdentity, HeaderSessionResult>;

const signedOutSession = {
  establish: cookieSession.establish,
  current: async () => null,
} satisfies SessionPort<SessionIdentity, CookieSessionResult>;

const otpConfig = {
  request: async () => ({ success: true }),
  prove: async (identifier, otp) =>
    otp === "123456"
      ? {
          success: true,
          data: {
            userId: `otp:${identifier}`,
            identifier,
          },
        }
      : {
          success: false,
          error: "invalid_otp",
        },
} satisfies OtpConfig;

const passkeyConfig = {
  beginRegistration: async (intent) => ({
    challenge:
      intent.kind === "sign-up"
        ? "register:sign-up"
        : `register:add:${intent.userId}`,
  }),
  verifyRegistration: async (credential) => {
    if (credential === "sign-up:new-passkey-user") {
      return {
        success: true,
        data: {
          intent: "sign-up",
          userId: "new-passkey-user",
        },
      };
    }

    if (credential === "add:current-user") {
      return {
        success: true,
        data: {
          intent: "add",
          userId: "current-user",
        },
      };
    }

    if (credential === "add:other-user") {
      return {
        success: true,
        data: {
          intent: "add",
          userId: "other-user",
        },
      };
    }

    return {
      success: false,
      error: "verification_failed",
    };
  },
  beginAuthentication: async () => ({
    challenge: "authenticate",
  }),
  verifyAuthentication: async (credential) =>
    credential === "valid-passkey"
      ? {
          success: true,
          data: { userId: "passkey-user" },
        }
      : {
          success: false,
          error: "credential_not_found",
        },
  list: async (userId) => [
    {
      credentialId: `credential:${userId}`,
      label: "Primary passkey",
    },
  ],
  remove: async (userId, credentialId) => {
    removedPasskeys.push(`${userId}:${credentialId}`);
    return { success: true };
  },
} satisfies PasskeyConfig<PasskeySummary>;

const googleCalendarConfig = {
  provider: "google",
  scopes: ["openid", "calendar"],
  begin: async (intent) => ({
    authorizationUrl:
      intent.kind === "authenticate"
        ? "https://google.example/authenticate"
        : `https://google.example/link?user=${intent.userId}`,
  }),
  authenticate: async (callbackUrl) =>
    callbackUrl.includes("state=valid")
      ? {
          success: true,
          data: {
            userId: "google-user",
            provider: "google",
            scopes: ["openid", "calendar"],
          },
        }
      : {
          success: false,
          error: "invalid_state",
        },
  link: async (userId, callbackUrl) => {
    if (!callbackUrl.includes("state=valid")) {
      return {
        success: false,
        error: "invalid_state",
      };
    }

    linkedAccounts.push(userId);

    return {
      success: true,
      data: { providerAccountId: "google-account" },
    };
  },
} satisfies OidcConfig<"google", ["openid", "calendar"]>;

function makeCompleteNamespaces<Identity extends AuthUser, SessionCreateResult>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
) {
  return {
    emailOtp: makeOtpNamespace(kernel, otpConfig),
    passkeys: makePasskeyNamespace(kernel, passkeyConfig),
    googleCalendar: makeOidcNamespace(kernel, googleCalendarConfig),
  };
}

function expectType<T>(value: T): T {
  return value;
}

const cookieAuth = makeAuth({
  session: cookieSession,
  strategies: makeCompleteNamespaces,
});
const headerAuth = makeAuth({
  session: headerSession,
  strategies: makeCompleteNamespaces,
});
const signedOutAuth = makeAuth({
  session: signedOutSession,
  strategies: makeCompleteNamespaces,
});

expectType<OtpNamespace<CookieSessionResult>>(cookieAuth.strategies.emailOtp);
expectType<PasskeyNamespace<HeaderSessionResult, PasskeySummary>>(
  headerAuth.strategies.passkeys,
);
expectType<
  OidcNamespace<"google", ["openid", "calendar"], CookieSessionResult>
>(cookieAuth.strategies.googleCalendar);

const failedOtp = await cookieAuth.strategies.emailOtp.authenticate({
  identifier: "person@example.com",
  otp: "invalid",
});
const successfulOtp = await cookieAuth.strategies.emailOtp.authenticate({
  identifier: "person@example.com",
  otp: "123456",
});

await cookieAuth.strategies.passkeys.beginSignUp();
const passkeySignUp = await cookieAuth.strategies.passkeys.completeRegistration(
  {
    credential: "sign-up:new-passkey-user",
  },
);
await cookieAuth.strategies.passkeys.beginAuthentication();
const passkeyAuthentication = await cookieAuth.strategies.passkeys.authenticate(
  {
    credential: "valid-passkey",
  },
);
const passkeyAddOptions = await cookieAuth.strategies.passkeys.beginAdd();
const passkeyAdd = await cookieAuth.strategies.passkeys.completeRegistration({
  credential: "add:current-user",
});
const passkeyMismatch =
  await cookieAuth.strategies.passkeys.completeRegistration({
    credential: "add:other-user",
  });
const passkeyList = await cookieAuth.strategies.passkeys.list();
await cookieAuth.strategies.passkeys.remove({
  credentialId: "credential:current-user",
});

await cookieAuth.strategies.googleCalendar.begin();
const oidcAuthentication = await cookieAuth.strategies.googleCalendar.callback({
  callbackUrl: "https://app.example/callback?state=valid",
});
const oidcLinkOptions = await cookieAuth.strategies.googleCalendar.beginLink();
const oidcLink = await cookieAuth.strategies.googleCalendar.linkCallback({
  callbackUrl: "https://app.example/link?state=valid",
});

const signedOutPasskeyAdd = await signedOutAuth.strategies.passkeys.beginAdd();
const signedOutPasskeyList = await signedOutAuth.strategies.passkeys.list();
const signedOutOidcLink =
  await signedOutAuth.strategies.googleCalendar.beginLink();

if (failedOtp.success || establishedUserIds.length !== 4) {
  throw new Error("Expected failures established a session");
}

if (
  !successfulOtp.success ||
  !("data" in successfulOtp) ||
  successfulOtp.data.session.cookie.value !== "cookie:otp:person@example.com"
) {
  throw new Error("OTP authentication did not establish its user");
}

if (
  !passkeySignUp.success ||
  !("data" in passkeySignUp) ||
  passkeySignUp.data.intent !== "sign-up" ||
  !("session" in passkeySignUp.data) ||
  passkeySignUp.data.session.cookie.value !== "cookie:new-passkey-user"
) {
  throw new Error("Passkey sign-up did not establish its user");
}

if (
  !passkeyAuthentication.success ||
  !("data" in passkeyAuthentication) ||
  passkeyAuthentication.data.session.cookie.value !== "cookie:passkey-user"
) {
  throw new Error("Passkey authentication did not establish its user");
}

if (
  !passkeyAddOptions.success ||
  !("data" in passkeyAddOptions) ||
  passkeyAddOptions.data.challenge !== "register:add:current-user" ||
  !passkeyAdd.success ||
  !("data" in passkeyAdd) ||
  passkeyAdd.data.intent !== "add" ||
  passkeyMismatch.success
) {
  throw new Error("Passkey management ignored current authority");
}

if (
  !passkeyList.success ||
  !("data" in passkeyList) ||
  passkeyList.data[0]?.credentialId !== "credential:current-user" ||
  removedPasskeys[0] !== "current-user:credential:current-user"
) {
  throw new Error("Passkey management used the wrong current user");
}

if (
  !oidcAuthentication.success ||
  !("data" in oidcAuthentication) ||
  oidcAuthentication.data.session.cookie.value !== "cookie:google-user"
) {
  throw new Error("OIDC callback did not establish its user");
}

if (
  !oidcLinkOptions.success ||
  !("data" in oidcLinkOptions) ||
  !oidcLinkOptions.data.authorizationUrl.includes("user=current-user") ||
  !oidcLink.success ||
  linkedAccounts[0] !== "current-user"
) {
  throw new Error("OIDC linking ignored current authority");
}

if (
  signedOutPasskeyAdd.success ||
  signedOutPasskeyList.success ||
  signedOutOidcLink.success
) {
  throw new Error("A signed-out user reached a protected operation");
}
