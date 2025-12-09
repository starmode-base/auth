import type {
  DecodeSessionTokenAdapter,
  EncodeSessionTokenAdapter,
} from "../types";

type Options = {
  secret: string;
  ttl: number;
};

type SessionTokenJwtAdapters = {
  encodeSessionToken: EncodeSessionTokenAdapter;
  decodeSessionToken: DecodeSessionTokenAdapter;
};

/**
 * Make session token JWT adapters
 *
 * @param options - The options for the session token JWT adapters
 * @returns The session token JWT adapters (encode and decode)
 */
export const makeSessionTokenJwt = (
  _options: Options,
): SessionTokenJwtAdapters => {
  // TODO: real JWT implementation
  return {
    encodeSessionToken: (payload) => {
      return btoa(JSON.stringify(payload));
    },
    decodeSessionToken: (token) => {
      try {
        const payload = JSON.parse(atob(token));
        return {
          sessionId: payload.sessionId,
          userId: payload.userId,
          valid: true,
          expired: false,
        };
      } catch {
        return null;
      }
    },
  };
};
