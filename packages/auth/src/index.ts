// @starmode/auth - Server core
export const VERSION = "0.0.1";

// Core
export { createAuth } from "./create-auth";

// Adapters
export {
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
  CreateAuthConfig,
  CreateAuthReturn,
  CreateAuth,
} from "./types";
