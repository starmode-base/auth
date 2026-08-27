import {
  makeAuth,
  makeOpaqueSession,
  makePasskey,
  makePasskeyStrategy,
} from "@starmode/auth2";
import { db } from "./db";

const session = makeOpaqueSession({
  storage: db.sessions,
  ttl: 30 * 24 * 60 * 60 * 1000,
});

const passkey = makePasskey({
  storage: db.credentials,
  challenge: { storage: db.challenges, ttl: 5 * 60 * 1000 },
  webAuthn: {
    rpId: "localhost",
    rpName: "Auth Passkey Demo",
    allowedOrigins: ["http://localhost:3107"],
  },
  displayName: async (context) =>
    context.intent === "add" ? context.userId : "New user",
  signUp: async () => db.users.create().userId,
  debug: true,
});

export const auth = makeAuth(session, (kernel) => ({
  passkeys: makePasskeyStrategy(kernel, passkey),
}));
