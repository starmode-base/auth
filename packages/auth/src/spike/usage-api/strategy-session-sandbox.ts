/**
 * Userland sandbox for the candidate makeAuth implementation.
 *
 * Everything in this file represents application-owned configuration and
 * usage. None of these adapters, strategies, fixtures, or calls are candidate
 * library exports.
 */
import type {
  AuthUser,
  PasskeySummary,
  SessionAdapter,
  SessionIdentity,
  WithOtpConfig,
  WithPasskeyConfig,
} from "./contracts";
import { makeAuth } from "./make-auth-sandbox";

type SandboxIdentity = SessionIdentity & {
  tenantId: string;
};

type SandboxSession = {
  establishedFor: string;
  credential: Uint8Array;
};

const sandboxSession = {
  kernel: {
    establish: async (userId) => ({
      establishedFor: userId,
      credential: new Uint8Array([1, 2, 3]),
    }),
    resolve: async () => ({
      userId: "current-user",
      tenantId: "tenant-1",
    }),
  },
  capabilities: {
    end: async () => undefined,
  },
} satisfies SessionAdapter<
  SandboxIdentity,
  SandboxSession,
  { end: () => Promise<void> }
>;

type SandboxOtpUser = AuthUser & {
  identifier: string;
};

const registrationOptions = {
  challenge: "registration-challenge",
  pubKeyCredParams: [
    {
      alg: -7,
      type: "public-key",
    },
  ],
  rp: {
    id: "example.com",
    name: "Example",
  },
  user: {
    displayName: "Sandbox user",
    id: "sandbox-user",
    name: "sandbox@example.com",
  },
} satisfies PublicKeyCredentialCreationOptionsJSON;

const authenticationOptions = {
  challenge: "authentication-challenge",
  rpId: "example.com",
} satisfies PublicKeyCredentialRequestOptionsJSON;

const registrationCredential = {
  clientExtensionResults: {},
  id: "registered-user",
  rawId: "sign-up",
  response: {
    attestationObject: "attestation",
    authenticatorData: "authenticator-data",
    clientDataJSON: "client-data",
    publicKey: "public-key",
    publicKeyAlgorithm: -7,
    transports: [],
  },
  type: "public-key",
} satisfies RegistrationResponseJSON;

const additionalRegistrationCredential = {
  ...registrationCredential,
  id: "current-user",
  rawId: "add",
} satisfies RegistrationResponseJSON;

const authenticationCredential = {
  clientExtensionResults: {},
  id: "authenticated-user",
  rawId: "authentication",
  response: {
    authenticatorData: "authenticator-data",
    clientDataJSON: "client-data",
    signature: "signature",
    userHandle: "authenticated-user",
  },
  type: "public-key",
} satisfies AuthenticationResponseJSON;

const otpStrategy = {
  request: async ({ identifier }) => {
    void identifier;
    return { success: true };
  },
  authenticate: async ({ identifier, otp }) => {
    if (otp !== "123456") {
      return {
        success: false,
        error: "invalid_otp",
      };
    }

    return {
      success: true,
      data: {
        userId: `otp:${identifier}`,
        identifier,
      },
    };
  },
} satisfies WithOtpConfig<SandboxOtpUser>;

const passkeyStrategy = {
  createRegistrationOptions: async ({ intent, userId }) => {
    void intent;
    void userId;
    return {
      success: true,
      data: registrationOptions,
    };
  },
  verifyRegistration: async ({ credential }) => {
    if (credential.rawId === "add") {
      return {
        success: true,
        data: {
          intent: "add",
          userId: credential.id,
        },
      };
    }

    return {
      success: true,
      data: {
        intent: "sign-up",
        userId: credential.id,
      },
    };
  },
  createAuthenticationOptions: async () => ({
    success: true,
    data: authenticationOptions,
  }),
  verifyAuthentication: async ({ credential }) => ({
    success: true,
    data: {
      userId: credential.id,
    },
  }),
  list: async (userId) => [
    {
      credentialId: `credential:${userId}`,
    },
  ],
  remove: async (userId, credentialId) => {
    void userId;
    void credentialId;
    return { success: true };
  },
} satisfies WithPasskeyConfig<PasskeySummary>;

const auth = makeAuth({
  debug: true,
  session: sandboxSession,
})
  .withOtp(otpStrategy)
  .withPasskey(passkeyStrategy);

async function runSandbox(): Promise<void> {
  await auth.otp.authenticate({
    identifier: "sandbox@example.com",
    otp: "invalid",
  });
  await auth.otp.authenticate({
    identifier: "sandbox@example.com",
    otp: "123456",
  });
  await auth.passkey.verifyAuthentication({
    credential: authenticationCredential,
  });
  await auth.passkey.verifyRegistration({
    credential: registrationCredential,
  });
  await auth.passkey.createAdditionalRegistrationOptions();
  await auth.passkey.verifyRegistration({
    credential: additionalRegistrationCredential,
  });
  await auth.passkey.list();
  await auth.passkey.remove({
    credentialId: "credential:current-user",
  });
  await auth.session.end();
}

await runSandbox();
