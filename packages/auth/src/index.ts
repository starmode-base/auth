// @starmode/auth - Server core

// Core
export { makeAuth } from "./make-auth";
export { makeCookieAuth } from "./make-cookie-auth";

// Adapters & Codecs
export {
  makeMemoryAdapters,
  otpSendConsole,
  makeSessionOpaque,
  makeSessionHmac,
  makeRegistrationHmac,
} from "./adapters";

// Types
export type {
  // Storage adapters
  StorageAdapter,
  StoredCredential,

  // Codecs
  SessionCodec,
  SessionPayload,
  SessionDecoded,
  RegistrationCodec,
  RegistrationPayload,
  RegistrationDecoded,

  // Send OTP
  SendOtp,

  // WebAuthn config
  WebAuthnConfig,

  // Return types
  RequestOtpReturn,
  VerifyOtpReturn,
  CreateRegistrationTokenReturn,
  ValidateRegistrationTokenReturn,
  GenerateRegistrationOptionsReturn,
  VerifyRegistrationReturn,
  GenerateAuthenticationOptionsReturn,
  VerifyAuthenticationReturn,

  // WebAuthn types
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationCredential,
  AuthenticationCredential,

  // Config & Return
  MakeAuthConfig,
  MakeAuthReturn,
  MakeAuth,

  // Cookie auth
  CookieAdapter,
  MakeCookieAuthConfig,
  CookieAuthReturn,
  MakeCookieAuth,

  // Client
  AuthClient,
} from "./types";
