import type { MakeSessionUnitConfig, SessionUnit } from "./contracts";

/**
 * Candidate value-oriented session unit.
 *
 * Credential transport remains outside core. Bindings read credentials from
 * their environment and persist the credentials returned by commands.
 */
export function makeSessionUnit<ReadContext, WriteContext>(
  config: MakeSessionUnitConfig<ReadContext, WriteContext>,
): SessionUnit<ReadContext, WriteContext> {
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
