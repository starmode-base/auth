import type { MakeSessionAuthConfig, SessionAuth } from "./contracts";

/**
 * Candidate value-oriented session core.
 *
 * Credential transport remains outside core. Bindings read credentials from
 * their environment and persist the credentials returned by commands.
 */
export function makeSessionAuth<ReadContext, WriteContext>(
  config: MakeSessionAuthConfig<ReadContext, WriteContext>,
): SessionAuth<ReadContext, WriteContext> {
  return {
    session: {
      async create({ context, userId }) {
        const credentials = await config.session.create(context, userId);
        return { success: true, data: credentials };
      },

      async validate({ context, accessToken }) {
        if (accessToken === null) {
          return null;
        }

        return config.session.validate(context, accessToken);
      },

      async refresh({ context, credentials }) {
        const refreshed = await config.session.refresh(context, credentials);

        return refreshed === null
          ? { success: false, error: "invalid_token" }
          : { success: true, data: refreshed };
      },

      async end({ context, credentials }) {
        await config.session.end(context, credentials);
        return { success: true };
      },
    },
  };
}
