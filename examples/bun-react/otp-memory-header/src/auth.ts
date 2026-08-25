import {
  makeAuth,
  makeOpaqueSession,
  makeOtp,
  makeOtpStrategy,
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
}));
