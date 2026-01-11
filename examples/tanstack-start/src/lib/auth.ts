import {
  makeAuth,
  storageMemory,
  sessionHmac,
  registrationHmac,
  otpSenderConsole,
} from "@starmode/auth";

export const auth = makeAuth({
  storage: storageMemory(),
  session: sessionHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 600,
  }),
  registration: registrationHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 300,
  }),
  sendOtp: otpSenderConsole,
  webauthn: {
    rpId: "localhost",
    rpName: "TanStack Start Example",
    origin: "http://localhost:3000",
  },
  debug: true,
});
