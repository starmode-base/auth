type Config = { session: object; otp?: object; passkey?: object };

declare function makeAuth<
  const Input extends Config & { otp: object; passkey: object },
>(config: Input): { otp: object; passkey: object };

declare function makeAuth<const Input extends Config>(config: Input): Input;

makeAuth({
  session: {},
  otp: {},
  passkey: {},
  x: null,
}); // No error. Input captures x.

// ML EXperiments

declare function makeAuth2(config: {
  session: object;
  otp: object;
  // passkey: never;
}): {
  session: object;
  otp: object;
};

declare function makeAuth2(config: {
  session: object;
  otp: never;
  // passkey: object;
}): {
  session: object;
  passkey: object;
};

declare function makeAuth2(config: {
  session: object;
  otp: object;
  passkey: object;
}): {
  session: object;
  otp: object;
  passkey: object;
};

export const auth2 = makeAuth2({
  session: {},
  otp: {},
  passkey: {},
  x: null, //produces an error
});

void auth2.session;
void auth2.otp;
void auth2.passkey;
