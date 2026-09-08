import type { SessionAdapter, SessionIdentity } from "../contracts";
import { randomBase64url } from "../lib/random-base64url";
import { makeOpaqueSessionResolver } from "./make-opaque-session-resolver";
import type {
  MakeOpaqueSessionConfig,
  OpaqueSessionCapabilities,
  OpaqueSessionCredential,
} from "./opaque-session-contracts";

/** Builds a session whose credential is an unguessable reference to storage */
export function makeOpaqueSession(
  config: MakeOpaqueSessionConfig,
): SessionAdapter<
  SessionIdentity,
  OpaqueSessionCredential,
  OpaqueSessionCapabilities
> {
  return {
    kernel: {
      establish: async (userId) => {
        const token = randomBase64url(32);
        const expiresAt = new Date(Date.now() + config.ttl);

        await config.storage.store({ sessionId: token, userId, expiresAt });

        return { token, expiresAt };
      },
      resolve: makeOpaqueSessionResolver({ storage: config.storage }).resolve,
    },
    capabilities: {
      end: async (token) => {
        if (token !== null) {
          await config.storage.delete(token);
        }
      },
    },
  };
}
