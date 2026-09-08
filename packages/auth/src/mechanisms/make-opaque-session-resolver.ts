import type { SessionIdentity, SessionResolver } from "../contracts";
import type { MakeOpaqueSessionResolverConfig } from "./opaque-session-contracts";

/** Read only session resolution for contexts without storage write access */
export function makeOpaqueSessionResolver(
  config: MakeOpaqueSessionResolverConfig,
): SessionResolver<SessionIdentity> {
  return {
    resolve: async (token) => {
      if (token === null) {
        return null;
      }

      const record = await config.storage.get(token);

      if (record === null || record.expiresAt < new Date()) {
        return null;
      }

      return { userId: record.userId };
    },
  };
}
