/**
 * Framework-neutral playground for the candidate server usage API.
 *
 * These literal objects are the complete DI contract. Their implementations
 * are deliberately inert and fail closed. Object-producing helpers may replace
 * the literals without changing makeAuth or its returned usage API.
 */
import type {
  PasskeySummary,
  SessionAdapter,
  SessionIdentity,
  WithOtpConfig,
  WithPasskeyConfig,
} from "./contracts";
import { makeAuth } from "./contracts";

type SessionClaims = SessionIdentity & {
  role: "member" | "admin";
};

type CreatedSession = {
  accessToken: string;
  refreshToken: string;
};

type RefreshedSession = {
  accessToken: string;
} | null;

type ListedSession = {
  sessionId: string;
  current: boolean;
  deviceName: string;
};

type User = {
  userId: string;
  isNew: boolean;
};

type ListedPasskey = PasskeySummary & {
  name: string;
  createdAt: Date;
};

declare const registrationOptions: PublicKeyCredentialCreationOptionsJSON;
declare const authenticationOptions: PublicKeyCredentialRequestOptionsJSON;

export const sessionCapabilities = {
  refresh: async (): Promise<RefreshedSession> => null,
  end: async () => undefined,
  list: async (): Promise<ListedSession[]> => [],
  endAll: async () => undefined,
  revoke: async ({ sessionId }: { sessionId: string }) => {
    void sessionId;
    return false;
  },
};

export const session = {
  kernel: {
    establish: async (userId: string) => ({
      accessToken: `access:${userId}`,
      refreshToken: `refresh:${userId}`,
    }),
    resolve: async (): Promise<SessionClaims | null> => null,
  },
  capabilities: sessionCapabilities,
} satisfies SessionAdapter<
  SessionClaims,
  CreatedSession,
  typeof sessionCapabilities
>;

export const otp = {
  request: async ({ identifier }) => {
    void identifier;
    return { success: true };
  },
  authenticate: async ({ identifier, otp: submittedOtp }) => {
    void identifier;
    void submittedOtp;
    return {
      success: false,
      error: "authentication_disabled",
    };
  },
} satisfies WithOtpConfig<User>;

export const passkey = {
  createRegistrationOptions: async ({ intent, userId }) => {
    if (intent === "sign-up" && userId === null) {
      return {
        success: false,
        error: "registration_disabled",
      };
    }

    return {
      success: true,
      data: registrationOptions,
    };
  },
  verifyRegistration: async ({ credential }) => {
    void credential;
    return {
      success: false,
      error: "verification_failed",
    };
  },
  createAuthenticationOptions: async () => ({
    success: true,
    data: authenticationOptions,
  }),
  verifyAuthentication: async ({ credential }) => {
    void credential;
    return {
      success: false,
      error: "verification_failed",
    };
  },
  list: async (userId) => {
    void userId;
    return [];
  },
  remove: async (userId, credentialId) => {
    void userId;
    void credentialId;
    return {
      success: false,
      error: "removal_disabled",
    };
  },
} satisfies WithPasskeyConfig<ListedPasskey>;

export const sessionOnlyAuth = makeAuth({ debug: true, session });

export const otpAuth = makeAuth({ debug: true, session }).withOtp(otp);

export const passkeyAuth = makeAuth({ debug: true, session }).withPasskey(
  passkey,
);

export const otpAndPasskeyAuth = makeAuth({ debug: true, session })
  .withOtp(otp)
  .withPasskey(passkey);

export const passkeyAndOtpAuth = makeAuth({ debug: true, session })
  .withPasskey(passkey)
  .withOtp(otp);

export const createSessionForCustomStrategy = (args: { userId: string }) =>
  sessionOnlyAuth.session.create(args);

export const requestOtp = (args: { identifier: string }) =>
  otpAndPasskeyAuth.otp.request(args);

export const authenticateWithOtp = (args: {
  identifier: string;
  otp: string;
}) => otpAndPasskeyAuth.otp.authenticate(args);

export const createPasskeyRegistrationOptions = () =>
  otpAndPasskeyAuth.passkey.createRegistrationOptions();

export const createAdditionalPasskeyRegistrationOptions = () =>
  otpAndPasskeyAuth.passkey.createAdditionalRegistrationOptions();

export const verifyPasskeyRegistration = (args: {
  credential: RegistrationResponseJSON;
}) => otpAndPasskeyAuth.passkey.verifyRegistration(args);

export const createPasskeyAuthenticationOptions = () =>
  otpAndPasskeyAuth.passkey.createAuthenticationOptions();

export const verifyPasskeyAuthentication = (args: {
  credential: AuthenticationResponseJSON;
}) => otpAndPasskeyAuth.passkey.verifyAuthentication(args);

export const listPasskeys = () => otpAndPasskeyAuth.passkey.list();

export const removePasskey = (args: { credentialId: string }) =>
  otpAndPasskeyAuth.passkey.remove(args);

export const getSession = () => otpAndPasskeyAuth.session.get();

export const refreshSession = () => otpAndPasskeyAuth.session.refresh();

export const endSession = () => otpAndPasskeyAuth.session.end();

export const listSessions = () => otpAndPasskeyAuth.session.list();

export const endAllSessions = () => otpAndPasskeyAuth.session.endAll();

export const revokeSession = (args: { sessionId: string }) =>
  otpAndPasskeyAuth.session.revoke(args);
