import type { TokenStatus } from "../contracts";

/** Session record carried by the HMAC session codec contract unit */
export type SessionRecord = {
  sessionId: string;
  userId: string;
  expiresAt: Date | null;
};

/** Decoded HMAC session token */
export type SessionDecoded = {
  record: SessionRecord;
  token: TokenStatus;
};

/** Contract exercised by make-session-hmac-codec.test.ts */
export type SessionCodec = {
  encode: (
    record: SessionRecord,
    token: { expiresAt: Date | null },
  ) => Promise<string>;
  decode: (token: string) => Promise<SessionDecoded | null>;
};
