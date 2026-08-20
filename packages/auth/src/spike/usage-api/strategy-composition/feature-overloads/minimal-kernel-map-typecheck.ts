declare function makeAuth<
  const Strategies extends Record<string, object>,
>(config: { session: object; strategies: () => Strategies }): Strategies;

const strategies = makeAuth({
  session: {},
  strategies: () => ({ emailOtp: {}, smsOtp: {} }),
  // @ts-expect-error Only the strategy map is generic. The outer object rejects x.
  x: null,
});

void strategies.emailOtp;
void strategies.smsOtp;
