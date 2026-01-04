// @starmode/auth - Server core

// Core
export { makeAuth } from "./make-auth";
export { makeCookieAuth } from "./make-cookie-auth";

// Adapters
export {
  makeMemoryAdapters,
  otpEmailMinimal,
  otpSendConsole,
  makeSessionTokenJwt,
} from "./adapters";

// Types
export type {
  // OTP
  StoreOtpAdapter,
  VerifyOtpAdapter,

  // User
  UpsertUserAdapter,

  // Session (stored data)
  StoreSessionAdapter,
  GetSessionAdapter,
  DeleteSessionAdapter,

  // Session token (string representation)
  EncodeSessionTokenAdapter,
  DecodeSessionTokenAdapter,

  // OTP delivery
  OtpEmailAdapter,
  OtpSendAdapter,

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
