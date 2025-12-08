// @starmode/auth - Server core

// Core
export { makeAuth } from "./make-auth";

// Adapters
export {
  memoryAdapters,
  otpEmailAdapterMinimal,
  otpSendAdapterConsole,
  sessionTokenAdapterJwt,
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
} from "./types";
