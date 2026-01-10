// Core
export { makeAuth } from "./make-auth";
export { makeCookieAuth } from "./make-cookie-auth";

// Presets
export { storageMemory } from "./presets/storage-memory";
export { sessionOpaque } from "./presets/session-opaque";
export { sessionHmac } from "./presets/session-hmac";
export { registrationHmac } from "./presets/registration-hmac";
export { otpSenderConsole } from "./presets/otp-sender-console";

// Types
export type * from "./types";
