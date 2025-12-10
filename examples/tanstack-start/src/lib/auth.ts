import {
  makeAuth,
  makeAuthHandler,
  makeMemoryAdapters,
  makeSessionTokenJwt,
  otpEmailMinimal,
  otpSendConsole,
} from "@starmode/auth";

const memoryAdapters = makeMemoryAdapters();

const auth = makeAuth({
  ...memoryAdapters,
  ...makeSessionTokenJwt({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 600,
  }),
  email: otpEmailMinimal,
  send: otpSendConsole,
});

export const handler = makeAuthHandler(auth);
