import type { AuthUser, SessionPort, StrategyKernel } from "./contracts";

const strategyTemplate: unique symbol = Symbol("strategyTemplate");

/** Type function encoded through this and applied by installDefinedStrategy. */
export interface StrategyApiTemplate {
  readonly identity: AuthUser;
  readonly sessionCreateResult: unknown;
  readonly type: object;
}

/** Applies one encoded namespace to a concrete session port. */
export type ApplyStrategyApi<
  Template extends StrategyApiTemplate,
  Identity extends AuthUser,
  SessionCreateResult,
> = (Template & {
  readonly identity: Identity;
  readonly sessionCreateResult: SessionCreateResult;
})["type"];

/** Strategy value carrying a hidden invariant type template. */
export type DefinedStrategy<Template extends StrategyApiTemplate> = {
  readonly [strategyTemplate]: (template: Template) => Template;
  mount: <Identity extends AuthUser, SessionCreateResult>(
    kernel: StrategyKernel<Identity, SessionCreateResult>,
  ) => ApplyStrategyApi<Template, Identity, SessionCreateResult>;
};

/**
 * Defines one reusable strategy.
 *
 * Template must be supplied explicitly because TypeScript cannot infer the
 * higher kinded relationship from mount alone.
 */
export function defineStrategy<Template extends StrategyApiTemplate>(
  mount: DefinedStrategy<Template>["mount"],
): DefinedStrategy<Template> {
  return {
    [strategyTemplate](template) {
      return template;
    },
    mount,
  };
}

/** Applies the hidden namespace template to the configured session port. */
export declare function installDefinedStrategy<
  Identity extends AuthUser,
  SessionCreateResult,
  Template extends StrategyApiTemplate,
>(
  session: SessionPort<Identity, SessionCreateResult>,
  strategy: DefinedStrategy<Template>,
): ApplyStrategyApi<Template, Identity, SessionCreateResult>;
