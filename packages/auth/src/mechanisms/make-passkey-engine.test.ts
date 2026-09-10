import { expect, test, vi } from "vitest";
import { base64urlEncode } from "../crypto";
import {
  makePasskeyEngine,
  type ChallengeRecord,
  type CredentialRecord,
} from "./make-passkey-engine";

test("verifyAdditionalRegistration rejects a mismatched user before storing the credential", async ({
  onTestFinished,
}) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
  onTestFinished(() => {
    vi.useRealTimers();
  });

  const challenge = base64urlEncode("alice-registration-challenge");
  const challenges = new Map<string, ChallengeRecord>([
    [
      challenge,
      {
        challenge,
        registration: { intent: "add", userId: "alice" },
        expiresAt: new Date("2026-09-10T00:05:00Z"),
      },
    ],
  ]);
  const credentials = new Map<string, CredentialRecord>();
  const engine = makePasskeyEngine({
    storage: {
      store: async (record) => {
        credentials.set(record.credentialId, record);
      },
      get: async (credentialId) => credentials.get(credentialId) ?? null,
      list: async (userId) =>
        [...credentials.values()].filter((record) => record.userId === userId),
      setCounter: async (credentialId, counter) => {
        const record = credentials.get(credentialId);
        if (record !== undefined) {
          credentials.set(credentialId, { ...record, counter });
        }
      },
    },
    challenge: {
      ttl: 300_000,
      storage: {
        store: async (record) => {
          challenges.set(record.challenge, record);
        },
        take: async (value) => {
          const record = challenges.get(value) ?? null;
          challenges.delete(value);
          return record;
        },
      },
    },
    webAuthn: {
      rpId: "localhost",
      rpName: "Passkey test",
      allowedOrigins: ["http://localhost:3107"],
    },
    displayName: async () => "Alice",
    signUp: null,
    debug: false,
  });

  // Bob presents a valid ceremony authorized to add a passkey for Alice.
  const result = await engine.verifyAdditionalRegistration({
    userId: "bob",
    credential: {
      response: {
        clientDataJSON: base64urlEncode(
          JSON.stringify({
            type: "webauthn.create",
            challenge,
            origin: "http://localhost:3107",
            crossOrigin: false,
          }),
        ),
        // None attestation for localhost with a P-256 key, user presence, and counter zero.
        attestationObject:
          "o2NmbXRkbm9uZWhhdXRoRGF0YViUSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NBAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAABAgMEBQYHCAkKCwwNDg-lAQIDJiABIVggc4bfp3XrEbULuQjvW6v7GEQlLGcat7NKW3q-T3Mk9-4iWCAxBHjXvCFc74iOq_iH4gN48MuSdnvGyUNYItSyEUne4GdhdHRTdG10oA",
      },
    },
  });

  expect([...credentials.values()]).toEqual([]);
  expect(result).toEqual({ success: false, error: "user_mismatch" });
});
