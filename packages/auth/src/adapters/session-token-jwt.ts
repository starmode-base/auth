import type { SessionTokenAdapter } from "../types";

type Options = {
  secret: string;
  ttl: number;
};

export const sessionTokenAdapterJwt = (
  _options: Options,
): SessionTokenAdapter => {
  // TODO: real JWT implementation
  return {
    encode: (payload) => {
      return btoa(JSON.stringify(payload));
    },
    decode: (token) => {
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
