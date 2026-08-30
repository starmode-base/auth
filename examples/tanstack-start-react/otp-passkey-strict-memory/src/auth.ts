import {
  makeAuth,
  makeOpaqueSession,
  makeOtp,
  makeOtpStrategy,
  makePasskey,
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

/**
 * Strict mode: OTP is for initial sign-up only. Once an account has
 * passkeys, OTP authentication is disabled for it.
 */
export async function hasPasskeys(identifier: string) {
  const existing = db.users.findByEmail(identifier);
  if (!existing) return false;

  const passkeys = await db.credentials.list(existing.userId);
  return passkeys.length > 0;
}

const passkey = makePasskey({
  storage: db.credentials,
  challenge: { storage: db.challenges, ttl: 5 * 60 * 1000 },
  webAuthn: {
    rpId: "localhost",
    rpName: "Auth OTP → Passkey (strict) Demo",
    allowedOrigins: ["http://localhost:3103"],
  },
  displayName: async (context) =>
    context.userId === null
      ? "New user"
      : (db.users.get(context.userId)?.email ?? "Unknown user"),
  signUp: null,
  debug: true,
});

export const auth = makeAuth(session, (kernel) => ({
  email: makeOtpStrategy(kernel, {
    request: async ({ identifier }) => {
      if (await hasPasskeys(identifier)) {
        return { success: true };
      }

      await emailOtp.request(identifier);
      return { success: true };
    },
    authenticate: async ({ identifier, otp }) => {
      if (await hasPasskeys(identifier)) {
        return { success: false, error: "authentication_disabled" };
      }

      if (!(await emailOtp.verify(identifier, otp))) {
        return { success: false, error: "invalid_otp" };
      }

      return { success: true, data: db.users.upsert(identifier) };
    },
  }),
  passkeys: makePasskeyStrategy(kernel, passkey),
}));
