/**
 * WebAuthn verification utilities
 *
 * Implements credential verification using Web Crypto API.
 * No external dependencies.
 */

import { base64urlDecode, base64urlEncode, sha256 } from "./crypto";
import { decodeCbor, type CborValue } from "./cbor";
import type {
  PasskeyRegistrationCredential,
  PasskeyAuthenticationCredential,
} from "./contracts";

const encoder = new TextEncoder();

type ClientData = {
  /** https://www.w3.org/TR/webauthn-3/#dom-collectedclientdata-type */
  type: string; // "webauthn.create" or "webauthn.get"
  /** https://www.w3.org/TR/webauthn-3/#dom-collectedclientdata-challenge */
  challenge: string;
  /** https://www.w3.org/TR/webauthn-3/#dom-collectedclientdata-origin */
  origin: string;
  /** https://www.w3.org/TR/webauthn-3/#dom-collectedclientdata-crossorigin */
  crossOrigin: boolean;
};

/** Decodes and validates clientDataJSON. Malformed input returns null. */
export function parseClientData(clientDataJSON: string): ClientData | null {
  const bytes = base64urlDecode(clientDataJSON);
  if (bytes === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const type = "type" in parsed ? parsed.type : null;
  const challenge = "challenge" in parsed ? parsed.challenge : null;
  const origin = "origin" in parsed ? parsed.origin : null;
  const crossOrigin = "crossOrigin" in parsed ? parsed.crossOrigin : false;

  if (
    typeof type !== "string" ||
    typeof challenge !== "string" ||
    typeof origin !== "string"
  ) {
    return null;
  }

  return { type, challenge, origin, crossOrigin: crossOrigin === true };
}

type ParsedAuthData = {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  userPresent: boolean;
  userVerified: boolean;
  credentialId?: Uint8Array | undefined;
  coseKey?: Map<CborValue, CborValue> | undefined;
};

/** Compare two Uint8Arrays for equality */
function arrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Concatenate two Uint8Arrays */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/**
 * The origin must match one allowed origin exactly (scheme + host + port),
 * and cross-origin ceremonies are rejected.
 */
function verifyOrigin(clientData: ClientData, allowedOrigins: string[]): void {
  if (clientData.crossOrigin) {
    throw new Error("Cross-origin ceremony rejected");
  }
  if (!allowedOrigins.includes(clientData.origin)) {
    throw new Error(`Origin not allowed: ${clientData.origin}`);
  }
}

/**
 * Convert DER-encoded ECDSA signature to raw format
 *
 * WebAuthn returns signatures in DER format:
 *   0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
 *
 * Web Crypto expects raw format: r || s (32 bytes each for P-256)
 */
function derToRaw(der: Uint8Array): Uint8Array {
  function byteAt(i: number): number {
    const byte = der[i];
    if (byte === undefined) {
      throw new Error("DER signature truncated");
    }
    return byte;
  }

  // Parse DER sequence
  if (byteAt(0) !== 0x30) {
    throw new Error("Invalid DER signature: expected sequence");
  }

  let offset = 2; // skip 0x30 and length byte

  // Parse r integer
  if (byteAt(offset) !== 0x02) {
    throw new Error("Invalid DER signature: expected integer tag for r");
  }
  const rLen = byteAt(offset + 1);
  if (offset + 2 + rLen > der.length) {
    throw new Error("DER signature truncated");
  }
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;

  // Parse s integer
  if (byteAt(offset) !== 0x02) {
    throw new Error("Invalid DER signature: expected integer tag for s");
  }
  const sLen = byteAt(offset + 1);
  if (offset + 2 + sLen > der.length) {
    throw new Error("DER signature truncated");
  }
  let s = der.subarray(offset + 2, offset + 2 + sLen);

  // DER integers may have leading zero for positive numbers
  // Strip leading zeros but keep 32 bytes
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);

  // Pad to 32 bytes each
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);

  return raw;
}

/**
 * Parse authenticator data
 *
 * Format:
 *   rpIdHash (32 bytes)
 *   flags (1 byte)
 *   signCount (4 bytes, big-endian)
 *   [attestedCredentialData] (if AT flag set)
 *   [extensions] (if ED flag set)
 *
 * Attested credential data format:
 *   aaguid (16 bytes)
 *   credentialIdLength (2 bytes, big-endian)
 *   credentialId (credentialIdLength bytes)
 *   credentialPublicKey (COSE, remaining bytes)
 */
function parseAuthData(authData: Uint8Array): ParsedAuthData {
  if (authData.length < 37) {
    throw new Error("Authenticator data too short");
  }

  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32]!;
  const signCount = new DataView(
    authData.buffer,
    authData.byteOffset + 33,
    4,
  ).getUint32(0, false);

  const userPresent = !!(flags & 0x01);
  const userVerified = !!(flags & 0x04);
  const attestedCredentialData = !!(flags & 0x40);

  let credentialId: Uint8Array | undefined;
  let coseKey: Map<CborValue, CborValue> | undefined;

  if (attestedCredentialData) {
    if (authData.length < 55) {
      throw new Error("Attested credential data too short");
    }
    // Skip aaguid (16 bytes), read credentialIdLength
    const credIdLen = new DataView(
      authData.buffer,
      authData.byteOffset + 53,
      2,
    ).getUint16(0, false);
    if (authData.length < 55 + credIdLen) {
      throw new Error("Credential id out of bounds");
    }

    credentialId = authData.subarray(55, 55 + credIdLen);
    const publicKeyBytes = authData.subarray(55 + credIdLen);
    const decoded = decodeCbor(publicKeyBytes);
    if (!(decoded instanceof Map)) {
      throw new Error("COSE key is not a map");
    }
    coseKey = decoded;
  }

  return {
    rpIdHash,
    flags,
    signCount,
    userPresent,
    userVerified,
    credentialId,
    coseKey,
  };
}

/**
 * Serialize COSE key to Uint8Array for storage
 *
 * We store just the raw x,y coordinates (64 bytes) with a type prefix
 * Format: 0x04 || x (32 bytes) || y (32 bytes)
 */
function serializeCoseKey(coseKey: Map<CborValue, CborValue>): Uint8Array {
  const kty = coseKey.get(1);
  const alg = coseKey.get(3);

  if (kty !== 2 || alg !== -7) {
    throw new Error("Only ES256 (P-256) keys supported");
  }

  const x = coseKey.get(-2);
  const y = coseKey.get(-3);
  if (
    !(x instanceof Uint8Array) ||
    !(y instanceof Uint8Array) ||
    x.length !== 32 ||
    y.length !== 32
  ) {
    throw new Error("Invalid P-256 coordinates");
  }

  // Uncompressed point format: 0x04 || x || y
  const result = new Uint8Array(65);
  result[0] = 0x04;
  result.set(x, 1);
  result.set(y, 33);
  return result;
}

/**
 * Import stored public key as CryptoKey
 *
 * Expects format: 0x04 || x (32 bytes) || y (32 bytes)
 */
async function importStoredKey(publicKey: Uint8Array): Promise<CryptoKey> {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("Invalid stored public key format");
  }

  const x = publicKey.subarray(1, 33);
  const y = publicKey.subarray(33, 65);

  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64urlEncode(x),
      y: base64urlEncode(y),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

type WebAuthnPolicy = {
  rpId: string;
  allowedOrigins: string[];
};

export type VerifyRegistrationResult = {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
};

/**
 * Verify a WebAuthn registration credential
 */
export async function verifyRegistrationCredential(
  credential: PasskeyRegistrationCredential,
  expectedChallenge: string,
  policy: WebAuthnPolicy,
): Promise<VerifyRegistrationResult> {
  // 1. Decode and verify clientDataJSON
  const clientData = parseClientData(credential.response.clientDataJSON);
  if (!clientData) {
    throw new Error("Invalid clientDataJSON");
  }

  // https://www.w3.org/TR/webauthn-3/#dom-collectedclientdata-type
  if (clientData.type !== "webauthn.create") {
    throw new Error("Invalid clientData type: expected webauthn.create");
  }

  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Challenge mismatch");
  }

  verifyOrigin(clientData, policy.allowedOrigins);

  // 2. Decode attestationObject (CBOR)
  const attestationBytes = base64urlDecode(
    credential.response.attestationObject,
  );
  if (!attestationBytes) {
    throw new Error("Invalid attestationObject encoding");
  }
  const attestationObject = decodeCbor(attestationBytes);
  if (!(attestationObject instanceof Map)) {
    throw new Error("attestationObject is not a map");
  }

  const authData = attestationObject.get("authData");
  if (!(authData instanceof Uint8Array)) {
    throw new Error("Missing authData in attestationObject");
  }

  // 3. Parse authData
  const parsed = parseAuthData(authData);

  // 4. Verify rpIdHash
  const expectedRpIdHash = await sha256(encoder.encode(policy.rpId));
  if (!arrayEqual(parsed.rpIdHash, expectedRpIdHash)) {
    throw new Error("RP ID hash mismatch");
  }

  // 5. Verify flags
  if (!parsed.userPresent) {
    throw new Error("User presence required");
  }

  // 6. Extract credential data
  if (!parsed.credentialId || !parsed.coseKey) {
    throw new Error("No credential data in authData");
  }

  // For "none" attestation (which we use), we skip attestation verification
  // and trust the credential. This is acceptable for most use cases.

  return {
    credentialId: base64urlEncode(parsed.credentialId),
    publicKey: serializeCoseKey(parsed.coseKey),
    counter: parsed.signCount,
  };
}

export type VerifyAuthenticationResult = {
  counter: number;
};

/**
 * Verify a WebAuthn authentication credential
 */
export async function verifyAuthenticationCredential(
  credential: PasskeyAuthenticationCredential,
  storedCredential: { publicKey: Uint8Array; counter: number },
  expectedChallenge: string,
  policy: WebAuthnPolicy,
): Promise<VerifyAuthenticationResult> {
  // 1. Decode and verify clientDataJSON
  const clientDataBytes = base64urlDecode(credential.response.clientDataJSON);
  const clientData = parseClientData(credential.response.clientDataJSON);
  if (!clientDataBytes || !clientData) {
    throw new Error("Invalid clientDataJSON");
  }

  // https://www.w3.org/TR/webauthn-3/#dom-collectedclientdata-type
  if (clientData.type !== "webauthn.get") {
    throw new Error("Invalid clientData type: expected webauthn.get");
  }

  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Challenge mismatch");
  }

  verifyOrigin(clientData, policy.allowedOrigins);

  // 2. Decode authenticatorData
  const authData = base64urlDecode(credential.response.authenticatorData);
  if (!authData) {
    throw new Error("Invalid authenticatorData encoding");
  }
  const parsed = parseAuthData(authData);

  // 3. Verify rpIdHash
  const expectedRpIdHash = await sha256(encoder.encode(policy.rpId));
  if (!arrayEqual(parsed.rpIdHash, expectedRpIdHash)) {
    throw new Error("RP ID hash mismatch");
  }

  // 4. Verify user presence
  if (!parsed.userPresent) {
    throw new Error("User presence required");
  }

  // 5. Verify counter (replay protection)
  // Counter of 0 means the authenticator doesn't support counters
  if (
    storedCredential.counter !== 0 &&
    parsed.signCount !== 0 &&
    parsed.signCount <= storedCredential.counter
  ) {
    throw new Error("Signature counter replay detected");
  }

  // 6. Verify signature
  const clientDataHash = await sha256(clientDataBytes);
  const signedData = concat(authData, clientDataHash);
  const signature = base64urlDecode(credential.response.signature);
  if (!signature) {
    throw new Error("Invalid signature encoding");
  }

  const publicKey = await importStoredKey(storedCredential.publicKey);
  const rawSignature = derToRaw(signature);

  // Create fresh ArrayBuffers to satisfy TypeScript's BufferSource type
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    new Uint8Array(rawSignature).buffer,
    new Uint8Array(signedData).buffer,
  );

  if (!valid) {
    throw new Error("Invalid signature");
  }

  return { counter: parsed.signCount };
}
