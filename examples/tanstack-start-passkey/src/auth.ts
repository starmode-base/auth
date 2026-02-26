import {
  makePasskeyAuth,
  memoryCredentialStorage,
  memorySessionStorage,
  sessionHmac,
  registrationHmac,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack";

export const auth = makePasskeyAuth({
  session: {
    storage: memorySessionStorage(),
    codec: sessionHmac({
      secret: "dev-secret-do-not-use-in-production",
      ttl: 600,
    }),
    transport: sessionTransportTanstack(sessionCookieDefaults),
    ttl: Infinity,
  },
  passkey: {
    storage: memoryCredentialStorage(),
    registrationCodec: registrationHmac({
      secret: "dev-registration-secret",
      ttl: 5 * 60 * 1000,
    }),
    webAuthn: {
      rpId: "localhost",
      rpName: "Auth Passkey Demo",
      challengeTtl: 5 * 60 * 1000,
    },
  },
  debug: true,
});
