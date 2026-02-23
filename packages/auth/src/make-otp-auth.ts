import type { OtpStorage, OtpTransportAdapter, OtpMethods } from "./types";
import type { ResultHelpers } from "./make-core-auth";

/** Generate a random 6-digit OTP */
function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const otp = (array[0]! % 1000000).toString().padStart(6, "0");
  return otp;
}

export function makeOtpMethods(
  storage: OtpStorage,
  transport: OtpTransportAdapter,
  result: ResultHelpers,
): OtpMethods {
  return {
    async requestOtp({ identifier }) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + transport.ttl);

      await storage.store({ identifier, otp, expiresAt });

      await transport.send(identifier, otp);

      return result.ok({});
    },

    async verifyOtp({ identifier, otp }) {
      const valid = await storage.verify(identifier, otp);

      if (!valid) {
        return result.fail("invalid_otp");
      }

      return result.ok({});
    },
  };
}
