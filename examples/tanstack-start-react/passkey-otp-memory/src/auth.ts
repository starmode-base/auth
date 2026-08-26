import {
  makeAuth,
  makeOpaqueSession,
  makeOtp,
  makePasskey,
  makePasskeyStrategy,
} from "@starmode/auth2";
import { db } from "./db";

const session = makeOpaqueSession({
  storage: db.sessions,
  ttl: 30 * 24 * 60 * 60 * 1000,
});

/**
 * OTP as a pure proof primitive: it verifies address ownership for adding an
 * email, and is never an authentication strategy in this flow.
 */
export const emailOtp = makeOtp({
  storage: db.otps,
  delivery: {
    send: async (identifier, otp) => {
      console.log(`[OTP] ${identifier}: ${otp}`);
    },
  },
  ttl: 10 * 60 * 1000,
  attempts: 3,
});

const passkey = makePasskey({
  storage: db.credentials,
  challenge: { storage: db.challenges, ttl: 5 * 60 * 1000 },
  webAuthn: {
    rpId: "localhost",
    rpName: "Auth Passkey → OTP Demo",
    allowedOrigins: ["http://localhost:3104"],
  },
  displayName: async (context) =>
    context.intent === "add"
      ? (db.users.get(context.userId)?.email ?? context.userId)
      : "New user",
  signUp: async () => db.users.create().userId,
  debug: true,
});

export const auth = makeAuth(session, (kernel) => ({
  passkeys: makePasskeyStrategy(kernel, passkey),
}));
