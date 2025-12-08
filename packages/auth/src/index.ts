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
  // Persistence adapters
  StoreOtpAdapter,
  VerifyOtpAdapter,
  UpsertUserAdapter,
  StoreSessionAdapter,
  GetSessionAdapter,
  DeleteSessionAdapter,

  // Token adapter
  SessionTokenAdapter,

  // OTP delivery adapters
  OtpEmailAdapter,
  OtpSendAdapter,

  // Config & Return
  CreateAuthConfig,
  CreateAuthReturn,
  CreateAuth,
} from "./types";
