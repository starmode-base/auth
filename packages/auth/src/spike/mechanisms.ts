/**
 * ΛUTH mechanisms — the mechanisms-layer spec: adapter logic shipped by the
 * library, environment-free. Factories here build correct adapters from
 * atomic primitives. Source of intent while the API is finalized, alongside
 * contracts.ts.
 */
import type { OtpRecord, OtpStorage } from "./contracts";

/**
 * Input for makeOtpStorage: OTP storage as two primitives. take must be
 * atomic — fetch and delete in one operation (e.g. DELETE … RETURNING,
 * GETDEL).
 */
export type MakeOtpStorageConfig = {
  store: (record: OtpRecord) => Promise<void>;
  /** Atomic fetch-and-delete. Unknown identifier returns null. */
  take: (identifier: string) => Promise<OtpRecord | null>;
};

/** Builds a correct OtpStorage (expiry, comparison, one-time use) from store/take */
export declare function makeOtpStorage(
  config: MakeOtpStorageConfig,
): OtpStorage;
