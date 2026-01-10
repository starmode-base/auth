import {
  makeAuth,
  makeMemoryAdapters,
  makeSessionHmac,
  makeRegistrationHmac,
  otpSendConsole,
} from "@starmode/auth";

export const auth = makeAuth({
  storage: makeMemoryAdapters(),
  session: makeSessionHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 600,
  }),
  registration: makeRegistrationHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 300,
  }),
  sendOtp: otpSendConsole,
  webauthn: {
    rpId: "localhost",
    rpName: "TanStack Start Example",
  },
});
