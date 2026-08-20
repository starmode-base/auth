/** Shared types for comparing fixed feature overloads with a kernel map. */

export type SessionConfig = {
  kind: "session";
};

export type OtpConfig = {
  channel: "email" | "sms";
};

export type PasskeyConfig = {
  relyingPartyId: string;
};

export type SessionAuth = {
  session: {
    get: () => Promise<{ userId: string } | null>;
  };
};

export type OtpNamespace = {
  authenticate: (args: {
    identifier: string;
    otp: string;
  }) => Promise<{ channel: "email" | "sms" }>;
};

export type PasskeyNamespace = {
  authenticate: (args: {
    credentialId: string;
  }) => Promise<{ credentialId: string }>;
};

export type OtpAuth = SessionAuth & {
  otp: OtpNamespace;
};

export type PasskeyAuth = SessionAuth & {
  passkey: PasskeyNamespace;
};

export type FullAuth = SessionAuth & {
  otp: OtpNamespace;
  passkey: PasskeyNamespace;
};

export type StrategyKernel = {
  authenticate: (userId: string) => Promise<void>;
};

export type StrategyNamespaces = Record<string, object>;

export type KernelMapAuth<Namespaces extends StrategyNamespaces> =
  SessionAuth & {
    strategies: Namespaces;
  };

export declare function makeOtpNamespace(
  kernel: StrategyKernel,
  config: OtpConfig,
): OtpNamespace;

export declare function makePasskeyNamespace(
  kernel: StrategyKernel,
  config: PasskeyConfig,
): PasskeyNamespace;
