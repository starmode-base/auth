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

export const sessionTokenAdapterJwt = (
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
