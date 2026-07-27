/**
 * Framework-neutral playground for the candidate server usage API.
 *
 * The adapters are deliberately inert. The file exists to make the complete
 * configuration and resulting application-facing operations visible together.
 */
import type {
  SessionAdapter,
  SessionSummary,
  WithOtpConfig,
  WithPasskeyConfig,
} from "./contracts";
import { makeAuth } from "./contracts";

type CreatedSession = {
  accessToken: string;
  refreshToken: string;
};

type RefreshedSession = {
  accessToken: string;
};

type ListedSession = SessionSummary & {
  current: boolean;
};

type User = {
  userId: string;
  isNew: boolean;
};

export const session = {
  create: async (userId) => ({
    accessToken: `access:${userId}`,
    refreshToken: `refresh:${userId}`,
  }),
  get: async () => ({ userId: "user-1" }),
  refresh: async () => ({ accessToken: "refreshed-access" }),
  end: async () => undefined,
  list: async (userId) => [
    {
      sessionId: `session:${userId}`,
      current: true,
    },
  ],
  endAll: async (userId) => {
    void userId;
  },
  revoke: async (userId, sessionId) => sessionId === `session:${userId}`,
} satisfies SessionAdapter<CreatedSession, RefreshedSession, ListedSession>;

export const otp = {
  storage: {
    store: async (record) => {
      void record;
    },
    verify: async (identifier, submittedOtp) =>
      identifier === "person@example.com" && submittedOtp === "123456",
  },
  delivery: {
    send: async (identifier, generatedOtp) => {
      void identifier;
      void generatedOtp;
    },
  },
  generateOtp: () => "123456",
  ttl: 10 * 60 * 1_000,
  authorizeRequest: async ({ identifier }) => identifier.length > 0,
  resolveUser: async ({ identifier }) => ({
    userId: identifier,
    isNew: false,
  }),
} satisfies WithOtpConfig<User>;

export const passkey = {
  storage: {
    store: async (record) => {
      void record;
    },
    get: async (credentialId) => {
      void credentialId;
      return null;
    },
    list: async (userId) => {
      void userId;
      return [];
    },
    setCounter: async (credentialId, counter) => {
      void credentialId;
      void counter;
    },
    delete: async (userId, credentialId) => {
      void userId;
      void credentialId;
      return false;
    },
  },
  challenge: {
    storage: {
      store: async (record) => {
        void record;
      },
      take: async (challenge) => {
        void challenge;
        return null;
      },
    },
    ttl: 5 * 60 * 1_000,
  },
  webAuthn: {
    rpId: "example.com",
    rpName: "Example",
    allowedOrigins: ["https://example.com"],
  },
  generateChallenge: () => "challenge",
  createUser: async () => ({
    userId: "user-1",
    identifier: null,
  }),
  getUser: async (userId) => ({
    userId,
    identifier: null,
  }),
  authorizeRegistration: async ({ userId, intent }) =>
    userId.length > 0 && (intent === "sign-up" || intent === "add"),
  authorizeAuthentication: async ({ userId }) => userId.length > 0,
  authorizeRemoval: async ({ userId, credentialId, credentialCount }) =>
    userId.length > 0 && credentialId.length > 0 && credentialCount > 1,
  verifyRegistrationCredential: async ({ credential, challenge, webAuthn }) => {
    void credential;
    void challenge;
    void webAuthn;
    return null;
  },
  verifyAuthenticationCredential: async ({
    credential,
    challenge,
    stored,
    webAuthn,
  }) => {
    void credential;
    void challenge;
    void stored;
    void webAuthn;
    return null;
  },
} satisfies WithPasskeyConfig;

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
