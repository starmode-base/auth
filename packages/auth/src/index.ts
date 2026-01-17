// Core
export { makeAuth } from "./make-auth";

// Presets - Storage
export { storageMemory } from "./presets/storage-memory";

// Presets - Codecs
export { sessionOpaque } from "./presets/session-opaque";
export { sessionHmac } from "./presets/session-hmac";
export { registrationHmac } from "./presets/registration-hmac";

// Presets - OTP Transport
export { otpTransportConsole } from "./presets/otp-transport-console";

// Presets - Session Transport (Layer 2)
export {
  sessionTransportCookie,
  sessionCookieDefaults,
} from "./presets/session-transport-cookie";
export { sessionTransportHeader } from "./presets/session-transport-header";
export { sessionTransportMemory } from "./presets/session-transport-memory";

// Parser
export { p } from "./parser";

// Types
export type * from "./types";
