import type {
  AuthUser,
  OtpNamespace,
  SessionIdentity,
  StrategyKernel,
  WithOtpConfig,
} from "../contracts";

/** Mounts a complete OTP strategy on the kernel */
export function makeOtpStrategy<
  Identity extends SessionIdentity,
  SessionCreateResult,
  User extends AuthUser,
>(
  kernel: StrategyKernel<Identity, SessionCreateResult>,
  config: WithOtpConfig<User>,
): OtpNamespace<User, SessionCreateResult> {
  return {
    request: (args) => config.request(args),
    authenticate: (args) =>
      kernel.authenticate(() => config.authenticate(args)),
  };
}
