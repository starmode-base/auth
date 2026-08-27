/** OTP record — the shape exchanged with OTP storage, not a stored schema */
export type OtpRecord = {
  /** Identifier (email address, phone number, etc.) */
  identifier: string;
  otp: string;
  expiresAt: Date;
  /** Verification attempts left before the OTP is consumed */
  attempts: number;
};

/**
 * OTP storage adapter. store upserts by identifier. take is an atomic
 * fetch-and-delete; an unknown identifier returns null.
 */
export type OtpStorage = {
  store: (record: OtpRecord) => Promise<void>;
  take: (identifier: string) => Promise<OtpRecord | null>;
};

/** OTP delivery adapter (email, SMS, console) */
export type OtpDelivery = {
  send: (identifier: string, otp: string) => Promise<void>;
};

export type MakeOtpConfig = {
  storage: OtpStorage;
  delivery: OtpDelivery;
  /** OTP validity duration in ms */
  ttl: number;
  /** Verification attempts per OTP; a wrong attempt beyond the last consumes it */
  attempts: number;
};

/** OTP proof primitive, usable with or without session establishment */
export type Otp = {
  /** Generates, stores, and delivers a fresh OTP for the identifier */
  request: (identifier: string) => Promise<void>;
  /** A wrong attempt spends one of the OTP's attempts; the last one consumes it */
  verify: (identifier: string, otp: string) => Promise<boolean>;
};

export function makeOtp(config: MakeOtpConfig): Otp {
  return {
    request: async (identifier) => {
      const otp = makeOtpValue();
      const expiresAt = new Date(Date.now() + config.ttl);

      await config.storage.store({
        identifier,
        otp,
        expiresAt,
        attempts: config.attempts,
      });
      await config.delivery.send(identifier, otp);
    },
    verify: async (identifier, otp) => {
      const record = await config.storage.take(identifier);

      if (record === null || record.expiresAt < new Date()) {
        return false;
      }

      if (record.otp === otp) {
        return true;
      }

      if (record.attempts > 1) {
        await config.storage.store({
          ...record,
          attempts: record.attempts - 1,
        });
      }

      return false;
    },
  };
}

const OTP_RANGE = 1_000_000;
const UNBIASED_LIMIT = Math.floor(2 ** 32 / OTP_RANGE) * OTP_RANGE;

/** Six digits, rejection sampled to remove modulo bias */
function makeOtpValue(): string {
  const draw = new Uint32Array(1);

  do {
    crypto.getRandomValues(draw);
  } while (draw[0]! >= UNBIASED_LIMIT);

  return (draw[0]! % OTP_RANGE).toString().padStart(6, "0");
}
