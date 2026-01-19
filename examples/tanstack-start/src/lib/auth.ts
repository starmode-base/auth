import {
  makeAuth,
  storageMemory,
  sessionHmac,
  registrationHmac,
  otpTransportConsole,
} from "@starmode/auth";
import {
  sessionTransportTanstack,
  sessionCookieDefaults,
} from "@starmode/auth/tanstack";

export const auth = makeAuth({
  storage: storageMemory(),
  sessionCodec: sessionHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 600,
  }),
  registrationCodec: registrationHmac({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 300,
  }),
  otpTransport: otpTransportConsole({ ttl: 10 * 60 * 1000 }),
  webAuthn: {
    rpId: "localhost",
    rpName: "TanStack Start Example",
    challengeTtl: 5 * 60 * 1000,
  },
  sessionTransport: sessionTransportTanstack(sessionCookieDefaults),
  sessionTtl: false,
  debug: true,
});

// TODO: Consider organizing the API:
// makeAuth({
//   storage: storageMemory(),
//   session: {
//     codec: sessionHmac({ secret, ttl: 600 }),
//     transport: sessionTransportCookie(options),
//     ttl: false, // forever
//   },
//   registration: {
//     codec: registrationHmac({ secret, ttl: 300 }),
//   },
//   otp: {
//     transport: otpTransportConsole,
//     ttl: 10 * 60 * 1000,
//   },
//   webAuthn: {
//     rpId: "localhost",
//     rpName: "My App",
//     challengeTtl: 5 * 60 * 1000,
//   },
// });
