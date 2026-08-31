import type {
  AuthUser,
  OtpStrategy,
  SessionIdentity,
  StrategyKernel,
  OtpEngine,
} from "../contracts";

/** Mounts a complete OTP strategy on the kernel */
export function makeOtpStrategy<
  Identity extends SessionIdentity,
  SessionCredential,
  User extends AuthUser,
>(
  kernel: StrategyKernel<Identity, SessionCredential>,
  config: OtpEngine<User>,
): OtpStrategy<User, SessionCredential> {
  return {
    request: (args) => config.request(args),
    authenticate: (args) =>
      kernel.authenticate(() => config.authenticate(args)),
  };
}
