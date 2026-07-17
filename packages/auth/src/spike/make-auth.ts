/**
 * Builder factory — type spike, no runtime.
 *
 * Proves the type contract: methods follow the chain, each step takes an
 * exact concrete config, and misconfiguration is unrepresentable. Only four
 * auth shapes exist, so every type is concrete — no generics.
 *
 * Shape rule: every config unit yields one method namespace. makeAuth's
 * unit is the session core (`session`); each with* step takes one config
 * group and adds its namespace (`otp`, `passkey`). The root holds only
 * namespaces and the remaining chain steps.
 *
 * Promote into make-auth.ts when the builder is implemented; the three old
 * factories are deleted then. See make-auth-typecheck.ts for the assertions.
 */
import type {
  SessionStorage,
  SessionCodec,
  SessionTransportAdapter,
  OtpStorage,
  OtpTransportAdapter,
  CredentialStorage,
  RegistrationCodec,
  WebAuthnConfig,
  CreateSessionResult,
  RequestOtpResult,
  VerifyOtpResult,
  CreateRegistrationTokenResult,
  ValidateRegistrationTokenResult,
  GenerateRegistrationOptionsResult,
  VerifyRegistrationResult,
  GenerateAuthenticationOptionsResult,
  VerifyAuthenticationResult,
  RegistrationCredential,
  AuthenticationCredential,
} from "../types";

/** WebAuthn challenge record (single-use) */
export type ChallengeRecord = {
  challenge: string;
  /** Set for registration ceremonies, null for authentication */
  userId: string | null;
  expiresAt: Date;
};

/** Challenge storage adapter — challenges are single-use, so take-shaped */
export type ChallengeStorage = {
  store: (record: ChallengeRecord) => Promise<void>;
  /** Atomic fetch-and-delete. Unknown challenge returns null. */
  take: (challenge: string) => Promise<ChallengeRecord | null>;
};

/** Config for makeAuth — the session core (session is not a sub-object; it IS the core) */
export type MakeAuthConfig = {
  storage: SessionStorage;
  codec: SessionCodec;
  transport: SessionTransportAdapter;
  /** Session TTL in ms (Infinity = forever). Inactivity timeout with sliding refresh. */
  ttl: number;
  debug: boolean;
};

/** Config for withOtp */
export type WithOtpConfig = {
  storage: OtpStorage;
  delivery: OtpTransportAdapter;
};

/** Config for withPasskey */
export type WithPasskeyConfig = {
  storage: CredentialStorage;
  challenges: ChallengeStorage;
  registrationCodec: RegistrationCodec;
  webAuthn: WebAuthnConfig;
};

/** Session methods — the core namespace, present at every step */
export type SessionNamespace = {
  create: (args: { userId: string }) => Promise<CreateSessionResult>;
  get: () => Promise<{ userId: string } | null>;
  /** End the current session (signs the user out) */
  end: () => Promise<void>;
  /** End all sessions for the current user (signs out every device) */
  endAll: () => Promise<void>;
};

/** Otp methods — added as the `otp` namespace by withOtp */
export type OtpNamespace = {
  request: (args: { identifier: string }) => Promise<RequestOtpResult>;
  verify: (args: {
    identifier: string;
    otp: string;
  }) => Promise<VerifyOtpResult>;
};

/** Passkey methods — added as the `passkey` namespace by withPasskey */
export type PasskeyNamespace = {
  createRegistrationToken: (args: {
    userId: string;
    identifier: string;
  }) => Promise<CreateRegistrationTokenResult>;
  validateRegistrationToken: (args: {
    token: string;
  }) => Promise<ValidateRegistrationTokenResult>;
  registrationOptions: (args: {
    registrationToken: string;
  }) => Promise<GenerateRegistrationOptionsResult>;
  verifyRegistration: (args: {
    registrationToken: string;
    credential: RegistrationCredential;
  }) => Promise<VerifyRegistrationResult>;
  authenticationOptions: () => Promise<GenerateAuthenticationOptionsResult>;
  verifyAuthentication: (args: {
    credential: AuthenticationCredential;
  }) => Promise<VerifyAuthenticationResult>;
};

/** Session-only auth — both strategies still available to chain */
export type AuthCore = {
  session: SessionNamespace;
  withOtp: (config: WithOtpConfig) => AuthCoreOtp;
  withPasskey: (config: WithPasskeyConfig) => AuthCorePasskey;
};

/** Sessions + otp — only withPasskey remains */
export type AuthCoreOtp = {
  session: SessionNamespace;
  otp: OtpNamespace;
  withPasskey: (config: WithPasskeyConfig) => AuthFull;
};

/** Sessions + passkeys — only withOtp remains */
export type AuthCorePasskey = {
  session: SessionNamespace;
  passkey: PasskeyNamespace;
  withOtp: (config: WithOtpConfig) => AuthFull;
};

/** Everything configured — nothing left to chain */
export type AuthFull = {
  session: SessionNamespace;
  otp: OtpNamespace;
  passkey: PasskeyNamespace;
};

export declare function makeAuth(config: MakeAuthConfig): AuthCore;
export type makeAuth2 = (config: MakeAuthConfig) => AuthCore;

/* Playground — no-op adapters. Note every one of them fails closed. */

export const auth = makeAuth({
  storage: {
    get: async () => null,
    deleteAll: async () => undefined,
    store: async () => undefined,
    delete: async () => undefined,
  },
  codec: {
    encode: async () => "",
    decode: async () => null,
    ttl: 0,
  },
  transport: {
    get: () => undefined,
    set: () => "",
    clear: () => undefined,
  },
  ttl: 0,
  debug: false,
});

auth.session.create({ userId: "123" });
auth.session.end();

const otpAuth = auth.withOtp({
  storage: {
    verify: async () => false,
    store: async () => undefined,
  },
  delivery: {
    send: async () => undefined,
    ttl: 0,
  },
});

otpAuth.otp.request({ identifier: "test@example.com" });
otpAuth.otp.verify({ identifier: "test@example.com", otp: "123456" });

export const passkey = auth.withPasskey({
  storage: {
    get: async () => [],
    getById: async () => null,
    updateCounter: async () => undefined,
    delete: async () => undefined,
    store: async () => undefined,
  },
  challenges: {
    store: async () => undefined,
    take: async () => null,
  },
  registrationCodec: {
    encode: async () => "",
    decode: async () => null,
  },
  webAuthn: {
    rpId: "localhost",
    rpName: "Spike",
    challengeTtl: 0,
  },
});

passkey.passkey.authenticationOptions();
// passkey.passkey.validateRegistrationToken()

export const passkeyAndOtp = passkey.withOtp({
  storage: {
    verify: async () => false,
    store: async () => undefined,
  },
  delivery: {
    send: async () => undefined,
    ttl: 0,
  },
});

passkeyAndOtp.otp.verify({ identifier: "test@example.com", otp: "123456" });
