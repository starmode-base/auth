import type {
  OtpAuthFullConfig,
  OtpAuthResult,
  StorageAdapter,
  OtpTransportAdapter,
  OtpMethods,
} from "./types";
import { makeCoreAuth, type ResultHelpers } from "./make-core-auth";

/** Generate a random 6-digit OTP */
function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const otp = (array[0]! % 1000000).toString().padStart(6, "0");
  return otp;
}

export function makeOtpMethods(
  storage: StorageAdapter,
  otpTransport: OtpTransportAdapter,
  result: ResultHelpers,
): OtpMethods {
  return {
    async requestOtp({ identifier }) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + otpTransport.ttl);

      await storage.otp.store({ identifier, otp, expiresAt });

      await otpTransport.send(identifier, otp);

      return result.ok({});
    },

    async verifyOtp({ identifier, otp }) {
      const valid = await storage.otp.verify(identifier, otp);

      if (!valid) {
        return result.fail("invalid_otp");
      }

      return result.ok({});
    },
  };
}

export function makeOtpAuth(config: OtpAuthFullConfig): OtpAuthResult {
  const { methods: core, result } = makeCoreAuth(config);
  const otp = makeOtpMethods(config.storage, config.otpTransport, result);
  return { ...core, ...otp };
}
