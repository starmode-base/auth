import { expect, test } from "vitest";
import type { OtpEngine } from "../contracts";
import { makeAuth } from "../make-auth";
import { makeOpaqueSession } from "./make-opaque-session";
import { makeOtp } from "./make-otp";
import { makeOtpStrategy } from "./make-otp-strategy";
import type { OtpRecord } from "./otp-contracts";
import type { SessionRecord } from "./opaque-session-contracts";

function makeFixture() {
  const otps = new Map<string, OtpRecord>();
  const sessions = new Map<string, SessionRecord>();
  const deliveries: { identifier: string; otp: string }[] = [];
  const primitive = makeOtp({
    storage: {
      store: async (record) => {
        otps.set(record.identifier, record);
      },
      take: async (identifier) => {
        const record = otps.get(identifier) ?? null;
        otps.delete(identifier);
        return record;
      },
    },
    delivery: {
      send: async (identifier, otp) => {
        deliveries.push({ identifier, otp });
      },
    },
    ttl: 60_000,
    attempts: 1,
  });
  const session = makeOpaqueSession({
    storage: {
      get: async (token) => sessions.get(token) ?? null,
      store: async (record) => {
        sessions.set(record.sessionId, record);
      },
      delete: async (token) => {
        sessions.delete(token);
      },
    },
    ttl: 60_000,
  });
  const engine: OtpEngine<{ userId: string; isNew: boolean }> = {
    request: async ({ identifier }) => {
      await primitive.request(identifier);
      return { success: true };
    },
    authenticate: async ({ identifier, otp }) => {
      if (!(await primitive.verify(identifier, otp))) {
        return { success: false, error: "invalid_otp" };
      }
      return {
        success: true,
        data: { userId: "application-user", isNew: true },
      };
    },
  };
  return { session, sessions, deliveries, engine };
}

test("request delegates identifier delivery to its engine without creating a session", async () => {
  const { session, sessions, deliveries, engine } = makeFixture();
  const auth = makeAuth(session, (kernel) => ({
    email: makeOtpStrategy(kernel, engine),
  }));

  expect(
    await auth.strategies.email.request({ identifier: "person@example.com" }),
  ).toStrictEqual({ success: true });
  expect(deliveries).toStrictEqual([
    { identifier: "person@example.com", otp: expect.any(String) },
  ]);
  expect([...sessions.values()]).toStrictEqual([]);
});

test("request preserves a silent policy denial returned by its engine", async () => {
  const { session, engine, sessions, deliveries } = makeFixture();
  const auth = makeAuth(session, (kernel) => ({
    email: makeOtpStrategy(kernel, {
      ...engine,
      request: async () => ({ success: true }),
    }),
  }));

  expect(
    await auth.strategies.email.request({ identifier: "denied@example.com" }),
  ).toStrictEqual({ success: true });
  expect(deliveries).toStrictEqual([]);
  expect([...sessions.values()]).toStrictEqual([]);
});

test("authenticate connects the engine's proven user to the configured session", async () => {
  const { session, engine, deliveries } = makeFixture();
  const auth = makeAuth(session, (kernel) => ({
    email: makeOtpStrategy(kernel, engine),
  }));
  await auth.strategies.email.request({ identifier: "person@example.com" });
  const delivered = deliveries[0];
  // Invariant: the successful fixture request delivered an OTP.
  if (delivered === undefined) {
    throw new Error("Expected an OTP delivery");
  }

  const outcome = await auth.strategies.email.authenticate(delivered);
  if (!outcome.success) {
    throw new Error(`Authentication failed: ${outcome.error}`);
  }

  expect(outcome.data.user).toStrictEqual({
    userId: "application-user",
    isNew: true,
  });
  expect(await auth.session.get(outcome.data.session.token)).toStrictEqual({
    userId: "application-user",
  });
});

test.each(["invalid_otp", "authentication_disabled"] satisfies Array<
  "invalid_otp" | "authentication_disabled"
>)(
  "authenticate preserves the engine's %s denial without establishing a session",
  async (error) => {
    const { session, sessions, engine } = makeFixture();
    const auth = makeAuth(session, (kernel) => ({
      email: makeOtpStrategy(kernel, {
        ...engine,
        authenticate: async () => ({ success: false, error }),
      }),
    }));

    expect(
      await auth.strategies.email.authenticate({
        identifier: "person@example.com",
        otp: "123456",
      }),
    ).toStrictEqual({ success: false, error });
    expect([...sessions.values()]).toStrictEqual([]);
  },
);

test("request propagates engine infrastructure failures", async () => {
  const { session, engine } = makeFixture();
  const failure = new Error("Delivery unavailable");
  const auth = makeAuth(session, (kernel) => ({
    email: makeOtpStrategy(kernel, {
      ...engine,
      request: async () => {
        throw failure;
      },
    }),
  }));

  await expect(
    auth.strategies.email.request({ identifier: "person@example.com" }),
  ).rejects.toBe(failure);
});

test("authenticate propagates engine infrastructure failures without establishing a session", async () => {
  const { session, sessions, engine } = makeFixture();
  const failure = new Error("Identity resolution unavailable");
  const auth = makeAuth(session, (kernel) => ({
    email: makeOtpStrategy(kernel, {
      ...engine,
      authenticate: async () => {
        throw failure;
      },
    }),
  }));

  await expect(
    auth.strategies.email.authenticate({
      identifier: "person@example.com",
      otp: "123456",
    }),
  ).rejects.toBe(failure);
  expect([...sessions.values()]).toStrictEqual([]);
});
