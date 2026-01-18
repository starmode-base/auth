/**
 * Validators for auth API inputs
 *
 * These parsers validate and type incoming data. Use with server functions
 * or REST handlers.
 */
import { p } from "./parser";

/** WebAuthn registration credential (passkey creation response) */
const registrationCredential = p.obj({
  id: p.str(),
  rawId: p.str(),
  type: p.literal(["public-key"]),
  response: p.obj({
    clientDataJSON: p.str(),
    attestationObject: p.str(),
    transports: p.optional(
      p.array(p.literal(["usb", "nfc", "ble", "internal", "hybrid"])),
    ),
  }),
  authenticatorAttachment: p.optional(
    p.literal(["platform", "cross-platform"]),
  ),
  clientExtensionResults: p.record(),
});

/** WebAuthn authentication credential (passkey assertion response) */
const authenticationCredential = p.obj({
  id: p.str(),
  rawId: p.str(),
  type: p.literal(["public-key"]),
  response: p.obj({
    clientDataJSON: p.str(),
    authenticatorData: p.str(),
    signature: p.str(),
    userHandle: p.optional(p.str()),
  }),
  authenticatorAttachment: p.optional(
    p.literal(["platform", "cross-platform"]),
  ),
  clientExtensionResults: p.record(),
});

/** Auth API input validators */
export const authValidators = {
  identifier: p.str(),
  verifyOtp: p.obj({ identifier: p.str(), otp: p.str() }),
  registrationToken: p.str(),
  verifyRegistration: p.obj({
    registrationToken: p.str(),
    credential: registrationCredential,
  }),
  credential: authenticationCredential,
};

/** Auth handler request body validator (discriminated union by fn) */
export const authBodyValidator = p.tagged("fn", {
  requestOtp: p.obj({ identifier: p.str() }),
  verifyOtp: p.obj({ identifier: p.str(), otp: p.str() }),
  generateRegistrationOptions: p.obj({ registrationToken: p.str() }),
  verifyRegistration: p.obj({
    registrationToken: p.str(),
    credential: registrationCredential,
  }),
  generateAuthenticationOptions: p.obj({}),
  verifyAuthentication: p.obj({ credential: authenticationCredential }),
  getSession: p.obj({}),
  signOut: p.obj({}),
});
