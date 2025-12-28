// @starmode/auth - Server core

// Core
export { makeAuth } from "./make-auth";
export { makeCookieAuth } from "./make-cookie-auth";
export { makeAuthHandler } from "./make-auth-handler";

// Adapters
export {
  makeMemoryAdapters,
  otpEmailAdapterlMinimal as otpEmailMinimal,
  otpSendAdapterConsole as otpSendConsole,
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

  // Handler (discriminated union)
  AuthRequest,
  RequestOtpResponse,
  VerifyOtpResponse,
  GetSessionResponse,
  SignOutResponse,
  AuthResponse,
  AuthHandler,
  MakeAuthHandler,
} from "./types";
