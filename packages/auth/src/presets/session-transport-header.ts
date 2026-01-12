import type { SessionTransportAdapter } from "../types";

export type SessionTransportHeaderConfig = {
  /** Read token from request (e.g., Authorization header) */
  get: () => string | undefined;
};

export const sessionTransportHeader = (
  config: SessionTransportHeaderConfig,
): SessionTransportAdapter => ({
  get: config.get,
  set: (token) => token,
  clear: () => {},
});
