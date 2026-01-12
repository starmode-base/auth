import type { SessionTransportAdapter } from "../types";

export type SessionTransportMemoryAdapter = SessionTransportAdapter & {
  /** Set token directly (useful for tests) */
  setToken: (token: string | undefined) => void;
};

/** In-memory session transport for testing */
export const sessionTransportMemory = (): SessionTransportMemoryAdapter => {
  let storedToken: string | undefined;
  return {
    get: () => storedToken,
    set: (token) => {
      storedToken = token;
      return token;
    },
    clear: () => {
      storedToken = undefined;
    },
    setToken: (token) => {
      storedToken = token;
    },
  };
};
