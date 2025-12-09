// @starmode/auth - Server core

// Core
export { makeAuth } from "./make-auth";
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

  // Handler
  AuthHandler,
  MakeAuthHandler,
} from "./types";
