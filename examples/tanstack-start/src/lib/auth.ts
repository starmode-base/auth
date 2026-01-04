import {
  makeAuth,
  makeMemoryAdapters,
  makeSessionTokenJwt,
  otpEmailMinimal,
  otpSendConsole,
} from "@starmode/auth";

export const auth = makeAuth({
  ...makeMemoryAdapters(),
  ...makeSessionTokenJwt({
    secret: "dev-secret-do-not-use-in-production",
    ttl: 600,
  }),
  email: otpEmailMinimal,
  send: otpSendConsole,
});
