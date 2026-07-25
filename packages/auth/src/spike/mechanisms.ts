/**
 * ΛUTH mechanisms — the mechanisms-layer spec: adapter logic shipped by the
 * library, environment-free. Factories here build correct adapters. Source
 * of intent while the API is finalized, alongside contracts.ts.
 */
import type {
  OtpRecord,
  OtpStorage,
  RegistrationCodec,
  SessionCodec,
} from "./contracts";

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

/** Input for makeSessionHmacCodec */
export type MakeSessionHmacCodecConfig = {
  secret: string;
  /** Token TTL in ms — the token expiry minted on fresh encodes */
  ttl: number;
};

/** Builds a self-contained session codec: an HMAC-signed token carrying the record */
export declare function makeSessionHmacCodec(
  config: MakeSessionHmacCodecConfig,
): SessionCodec;

/** Input for makeRegistrationHmacCodec */
export type MakeRegistrationHmacCodecConfig = {
  secret: string;
  /** Registration token validity in ms */
  ttl: number;
};

/** Builds a self-contained registration codec: an HMAC-signed token carrying the grant */
export declare function makeRegistrationHmacCodec(
  config: MakeRegistrationHmacCodecConfig,
): RegistrationCodec;
