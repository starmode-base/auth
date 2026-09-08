import type { MakeOtpConfig, Otp } from "./otp-contracts";

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
