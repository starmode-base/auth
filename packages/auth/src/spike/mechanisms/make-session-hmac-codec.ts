import type { SessionCodec } from "./session-hmac-codec-contract";

/** Input for makeSessionHmacCodec */
export type MakeSessionHmacCodecConfig = {
  secret: string;
  /** Token TTL in ms — the token expiry minted on fresh encodes */
  ttl: number;
};

/** Builds a self-contained session codec: an HMAC-signed token carrying the record */
export function makeSessionHmacCodec(
  config: MakeSessionHmacCodecConfig,
): SessionCodec {
  void config;
  throw new Error("not implemented");
}
