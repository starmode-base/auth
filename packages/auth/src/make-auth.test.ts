import { expect, test } from "vitest";
import type { Result, SessionAdapter, SessionIdentity } from "./contracts";
import { makeAuth } from "./make-auth";

function makeSession() {
  const records = new Map<string, SessionIdentity>();
  const session: SessionAdapter<
    SessionIdentity,
    string,
    { end: (token: string) => Promise<void> }
  > = {
    kernel: {
      establish: async (userId) => {
        const token = `session-${records.size}`;
        records.set(token, { userId });
        return token;
      },
      resolve: async (token) =>
        token === null ? null : (records.get(token) ?? null),
    },
    capabilities: {
      end: async (token) => {
        records.delete(token);
      },
    },
  };
  return { records, session };
}

test("makeAuth constructs namespaces without reading or establishing a session", () => {
  const auth = makeAuth(
    {
      kernel: {
        establish: async () => {
          throw new Error("Construction cannot establish a session");
        },
        resolve: async () => {
          throw new Error("Construction cannot resolve a session");
        },
      },
      capabilities: {},
    },
    () => ({ custom: { value: "configured" } }),
  );

  expect(auth.strategies.custom.value).toBe("configured");
  expect(Object.keys(auth.session)).toStrictEqual(["get"]);
});

test("authenticate establishes the exact proven user and preserves the proof's additional data", async () => {
  const { session } = makeSession();
  const user = { userId: "proven-user", isNew: true };
  const auth = makeAuth(session, (kernel) => ({
    custom: {
      authenticate: () =>
        kernel.authenticate<typeof user, never>(
          async (): Promise<Result<typeof user, never>> => ({
            success: true,
            data: user,
          }),
        ),
    },
  }));

  const outcome = await auth.strategies.custom.authenticate();

  expect(outcome.data.user).toStrictEqual(user);
  expect(await auth.session.get(outcome.data.session)).toStrictEqual({
    userId: "proven-user",
  });
});

test("authenticate returns a failed proof without establishing a session", async () => {
  const { session, records } = makeSession();
  const auth = makeAuth(session, (kernel) => ({
    custom: {
      authenticate: () =>
        kernel.authenticate(
          async (): Promise<Result<SessionIdentity, "denied">> => ({
            success: false,
            error: "denied",
          }),
        ),
    },
  }));

  expect(await auth.strategies.custom.authenticate()).toStrictEqual({
    success: false,
    error: "denied",
  });
  expect([...records.values()]).toStrictEqual([]);
});

test("authenticate waits for a successful proof before establishing a session", async () => {
  const { session, records } = makeSession();
  const proof = Promise.withResolvers<Result<SessionIdentity, never>>();
  const auth = makeAuth(session, (kernel) => ({
    custom: {
      authenticate: () =>
        kernel.authenticate<SessionIdentity, never>(() => proof.promise),
    },
  }));

  const pending = auth.strategies.custom.authenticate();

  expect([...records.values()]).toStrictEqual([]);
  proof.resolve({ success: true, data: { userId: "proven-user" } });
  const outcome = await pending;
  expect(await auth.session.get(outcome.data.session)).toStrictEqual({
    userId: "proven-user",
  });
});

test("authenticate propagates proof failures without establishing a session", async () => {
  const { session, records } = makeSession();
  const failure = new Error("Proof infrastructure unavailable");
  const auth = makeAuth(session, (kernel) => ({
    custom: {
      authenticate: () =>
        kernel.authenticate(async () => {
          throw failure;
        }),
    },
  }));

  await expect(auth.strategies.custom.authenticate()).rejects.toBe(failure);
  expect([...records.values()]).toStrictEqual([]);
});

test("authenticate propagates session establishment failures", async () => {
  const { session } = makeSession();
  const failure = new Error("Session infrastructure unavailable");
  const auth = makeAuth(
    {
      ...session,
      kernel: {
        ...session.kernel,
        establish: async () => {
          throw failure;
        },
      },
    },
    (kernel) => ({
      custom: {
        authenticate: () =>
          kernel.authenticate(
            async (): Promise<Result<SessionIdentity, never>> => ({
              success: true,
              data: { userId: "proven-user" },
            }),
          ),
      },
    }),
  );

  await expect(auth.strategies.custom.authenticate()).rejects.toBe(failure);
});

test.each(["first", "second", "unknown", null])(
  "get and current resolve the same presented credential (%s)",
  async (token) => {
    const { session, records } = makeSession();
    records.set("first", { userId: "first-user" });
    records.set("second", { userId: "second-user" });
    const original = [...records.entries()];
    const auth = makeAuth(session, (kernel) => ({
      custom: {
        current: (credential: string | null) => kernel.current(credential),
      },
    }));
    const expected = token === null ? null : (records.get(token) ?? null);

    expect(await auth.session.get(token)).toStrictEqual(expected);
    expect(await auth.strategies.custom.current(token)).toStrictEqual(expected);
    expect([...records.entries()]).toStrictEqual(original);
  },
);

test("makeAuth projects configured session capabilities unchanged", async () => {
  const { session, records } = makeSession();
  records.set("presented", { userId: "owner" });
  const auth = makeAuth(session, () => ({}));

  expect(auth.session.end).toBe(session.capabilities.end);
  await auth.session.end("presented");
  expect(await auth.session.get("presented")).toBeNull();
});

test("get and current propagate resolution failures", async () => {
  const { session } = makeSession();
  const failure = new Error("Resolution unavailable");
  const auth = makeAuth(
    {
      ...session,
      kernel: {
        ...session.kernel,
        resolve: async () => {
          throw failure;
        },
      },
    },
    (kernel) => ({
      custom: { current: () => kernel.current("presented") },
    }),
  );

  await expect(auth.session.get("presented")).rejects.toBe(failure);
  await expect(auth.strategies.custom.current()).rejects.toBe(failure);
});
