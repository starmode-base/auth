import { afterEach, describe, expect, test, vi } from "vitest";
import { makeOtp } from "./make-otp";
import type { OtpDelivery, OtpRecord, OtpStorage } from "./otp-contracts";

const identifier = "person@example.com";

function makeFixture(attempts: number) {
  const record: OtpRecord = {
    identifier,
    otp: "123456",
    expiresAt: new Date(Date.now() + 60_000),
    attempts,
  };
  const records = new Map<string, OtpRecord>([[identifier, record]]);
  const sent: { identifier: string; otp: string }[] = [];
  const storage: OtpStorage = {
    store: async (value) => {
      records.set(value.identifier, value);
    },
    take: async (key) => {
      const value = records.get(key) ?? null;
      records.delete(key);
      return value;
    },
  };
  const delivery: OtpDelivery = {
    send: async (key, otp) => {
      sent.push({ identifier: key, otp });
    },
  };
  const config = { storage, delivery, ttl: 60_000, attempts };
  return { record, records, sent, config, otp: makeOtp(config) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("issuance", () => {
  test("request delivers the stored six digit OTP to the requested identifier", async () => {
    const { records, sent, otp } = makeFixture(3);

    await otp.request(identifier);

    expect(sent).toStrictEqual([
      { identifier, otp: expect.stringMatching(/^\d{6}$/) },
    ]);
    expect(records.get(identifier)?.otp).toBe(sent[0]?.otp);
  });

  test("request stores the configured lifetime and attempt budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    const { records, otp } = makeFixture(3);

    await otp.request(identifier);

    expect(records.get(identifier)).toStrictEqual({
      identifier,
      otp: expect.stringMatching(/^\d{6}$/),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 3,
    });
  });

  test("request discards random draws outside the unbiased six digit range", async () => {
    const draws = [4_294_000_000, 7];
    vi.spyOn(crypto, "getRandomValues").mockImplementation((buffer) => {
      if (!(buffer instanceof Uint32Array)) {
        throw new Error("Expected a random integer buffer");
      }
      const draw = draws.shift();
      if (draw === undefined) {
        throw new Error("Unexpected extra random draw");
      }
      buffer[0] = draw;
      return buffer;
    });
    const { sent, otp } = makeFixture(3);

    await otp.request(identifier);

    expect(sent).toStrictEqual([{ identifier, otp: "000007" }]);
  });

  test("request makes the OTP available before delivery", async () => {
    const { config, records } = makeFixture(3);
    records.clear();
    let acceptedAtDelivery = false;
    const otp = makeOtp({
      ...config,
      delivery: {
        send: async (key, value) => {
          acceptedAtDelivery = await otp.verify(key, value);
        },
      },
    });

    await otp.request(identifier);

    expect(acceptedAtDelivery).toBe(true);
  });

  test("request propagates persistence failure without delivering an unusable OTP", async () => {
    const { config, sent } = makeFixture(3);
    const failure = new Error("Storage unavailable");
    const otp = makeOtp({
      ...config,
      storage: {
        ...config.storage,
        store: async () => {
          throw failure;
        },
      },
    });

    await expect(otp.request(identifier)).rejects.toBe(failure);
    expect(sent).toStrictEqual([]);
  });

  test("request propagates delivery failure", async () => {
    const { config } = makeFixture(3);
    const failure = new Error("Delivery unavailable");
    const otp = makeOtp({
      ...config,
      delivery: {
        send: async () => {
          throw failure;
        },
      },
    });

    await expect(otp.request(identifier)).rejects.toBe(failure);
  });
});

describe("verification", () => {
  test("verify accepts a matching OTP only once", async () => {
    const { otp } = makeFixture(3);

    expect(await otp.verify(identifier, "123456")).toBe(true);
    expect(await otp.verify(identifier, "123456")).toBe(false);
  });

  test("verify rejects an OTP presented for another identifier without consuming its owner's OTP", async () => {
    const { otp } = makeFixture(3);

    expect(await otp.verify("other@example.com", "123456")).toBe(false);
    expect(await otp.verify(identifier, "123456")).toBe(true);
  });

  test.each([
    { offset: -1, accepted: false, description: "expired" },
    { offset: 0, accepted: true, description: "at its deadline" },
    { offset: 1, accepted: true, description: "before its deadline" },
  ])(
    "verify accepts a matching OTP only through its deadline ($description)",
    async ({ offset, accepted }) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
      const { record, records, otp } = makeFixture(3);
      records.set(identifier, {
        ...record,
        expiresAt: new Date(Date.now() + offset),
      });

      expect(await otp.verify(identifier, record.otp)).toBe(accepted);
      expect(records.has(identifier)).toBe(false);
    },
  );

  test("verify spends a wrong attempt while preserving the OTP's remaining lifetime", async () => {
    const { record, records, otp } = makeFixture(3);

    expect(await otp.verify(identifier, "000000")).toBe(false);
    expect(records.get(identifier)).toStrictEqual({ ...record, attempts: 2 });
    expect(await otp.verify(identifier, record.otp)).toBe(true);
  });

  test("verify consumes the OTP after the configured number of wrong attempts", async () => {
    const { otp } = makeFixture(3);

    expect(await otp.verify(identifier, "000000")).toBe(false);
    expect(await otp.verify(identifier, "000000")).toBe(false);
    expect(await otp.verify(identifier, "000000")).toBe(false);
    expect(await otp.verify(identifier, "123456")).toBe(false);
  });

  test("verify consumes a single attempt OTP on the first mismatch", async () => {
    const { otp } = makeFixture(1);

    expect(await otp.verify(identifier, "000000")).toBe(false);
    expect(await otp.verify(identifier, "123456")).toBe(false);
  });

  test("verify propagates take failures", async () => {
    const { config } = makeFixture(3);
    const failure = new Error("Storage unavailable");
    const otp = makeOtp({
      ...config,
      storage: {
        ...config.storage,
        take: async () => {
          throw failure;
        },
      },
    });

    await expect(otp.verify(identifier, "123456")).rejects.toBe(failure);
  });

  test("verify propagates retry persistence failure with the OTP consumed", async () => {
    const { config, records } = makeFixture(3);
    const failure = new Error("Storage unavailable");
    const otp = makeOtp({
      ...config,
      storage: {
        ...config.storage,
        store: async () => {
          throw failure;
        },
      },
    });

    await expect(otp.verify(identifier, "000000")).rejects.toBe(failure);
    expect(records.has(identifier)).toBe(false);
  });
});

describe("concurrent verification", () => {
  test("verify accepts only one concurrent submission over atomic take", async () => {
    const { config } = makeFixture(3);
    const taken = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let firstTake = true;
    const otp = makeOtp({
      ...config,
      storage: {
        ...config.storage,
        take: async (key) => {
          const record = await config.storage.take(key);
          if (firstTake) {
            firstTake = false;
            taken.resolve();
            await release.promise;
          }
          return record;
        },
      },
    });

    // The first submission owns the OTP while the second tries to consume it.
    const first = otp.verify(identifier, "123456");
    await taken.promise;
    const second = await otp.verify(identifier, "123456");
    release.resolve();

    expect([await first, second]).toStrictEqual([true, false]);
  });

  test("verify rejects a submission during a mismatch retry's persistence window", async () => {
    const { config } = makeFixture(3);
    const retrying = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const otp = makeOtp({
      ...config,
      storage: {
        ...config.storage,
        store: async (record) => {
          retrying.resolve();
          await release.promise;
          await config.storage.store(record);
        },
      },
    });

    // The remaining attempt is unavailable until the mismatch has been persisted.
    const wrong = otp.verify(identifier, "000000");
    await retrying.promise;
    const duringRetry = await otp.verify(identifier, "123456");
    release.resolve();

    expect(await wrong).toBe(false);
    expect(duringRetry).toBe(false);
    expect(await otp.verify(identifier, "123456")).toBe(true);
  });
});
