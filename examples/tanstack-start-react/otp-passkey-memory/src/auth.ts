import {
  makeAuth,
  makeOpaqueSession,
  makeOtp,
  makeOtpStrategy,
  makePasskeyEngine,
  makePasskeyStrategy,
} from "@starmode/auth2";
import { db } from "./db";

const session = makeOpaqueSession({
  storage: db.sessions,
  ttl: 30 * 24 * 60 * 60 * 1000,
});

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

const passkey = makePasskeyEngine({
  storage: db.credentials,
  challenge: { storage: db.challenges, ttl: 5 * 60 * 1000 },
  webAuthn: {
    rpId: "localhost",
    rpName: "Auth OTP → Passkey Demo",
    allowedOrigins: ["http://localhost:3102"],
  },
  displayName: async (context) =>
    context.intent === "add"
      ? (db.users.get(context.userId)?.email ?? "Unknown user")
      : "New user",
  signUp: null,
  debug: true,
});

export const auth = makeAuth(session, (kernel) => ({
  email: makeOtpStrategy(kernel, {
    request: async ({ identifier }) => {
      await emailOtp.request(identifier);
      return { success: true };
    },
    authenticate: async ({ identifier, otp }) => {
      if (!(await emailOtp.verify(identifier, otp))) {
        return { success: false, error: "invalid_otp" };
      }

      return { success: true, data: db.users.upsert(identifier) };
    },
  }),
  passkeys: makePasskeyStrategy(kernel, passkey),
}));
