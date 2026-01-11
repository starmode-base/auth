/**
 * WebAuthn verification utilities
 *
 * Implements credential verification using Web Crypto API.
 * No external dependencies.
 */

import { base64urlDecode, base64urlEncode, sha256 } from "./crypto";
import { decodeCbor, type CborValue } from "./cbor";
import type {
  RegistrationCredential,
  AuthenticationCredential,
  StoredCredential,
} from "./types";

const encoder = new TextEncoder();

type ClientData = {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
};

type ParsedAuthData = {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  userPresent: boolean;
  userVerified: boolean;
  credentialId?: Uint8Array;
  coseKey?: Map<CborValue, CborValue>;
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
 * Convert DER-encoded ECDSA signature to raw format
 *
 * WebAuthn returns signatures in DER format:
 *   0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
 *
 * Web Crypto expects raw format: r || s (32 bytes each for P-256)
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // Parse DER sequence
  if (der[0] !== 0x30) {
    throw new Error("Invalid DER signature: expected sequence");
  }

  let offset = 2; // skip 0x30 and length byte

  // Parse r integer
  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER signature: expected integer tag for r");
  }
  const rLen = der[offset + 1]!;
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;

  // Parse s integer
  if (der[offset] !== 0x02) {
    throw new Error("Invalid DER signature: expected integer tag for s");
  }
  const sLen = der[offset + 1]!;
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
    // Skip aaguid (16 bytes), read credentialIdLength
    const credIdLen = new DataView(
      authData.buffer,
      authData.byteOffset + 53,
      2,
    ).getUint16(0, false);

    credentialId = authData.subarray(55, 55 + credIdLen);
    const publicKeyBytes = authData.subarray(55 + credIdLen);
    coseKey = decodeCbor(publicKeyBytes) as Map<CborValue, CborValue>;
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
 * Convert COSE key to CryptoKey for signature verification
 *
 * COSE key map keys:
 *   1 (kty): 2 = EC2
 *   3 (alg): -7 = ES256
 *  -1 (crv): 1 = P-256
 *  -2 (x): x coordinate (32 bytes)
 *  -3 (y): y coordinate (32 bytes)
 */
async function importCoseKey(
  coseKey: Map<CborValue, CborValue>,
): Promise<CryptoKey> {
  const kty = coseKey.get(1);
  const alg = coseKey.get(3);

  if (kty !== 2 || alg !== -7) {
    throw new Error("Only ES256 (P-256) keys supported");
  }

  const x = coseKey.get(-2) as Uint8Array;
  const y = coseKey.get(-3) as Uint8Array;

  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error("Invalid EC key coordinates");
  }

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

  const x = coseKey.get(-2) as Uint8Array;
  const y = coseKey.get(-3) as Uint8Array;

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

export type VerifyRegistrationResult = {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransport[];
};

/**
 * Verify a WebAuthn registration credential
 *
 * @param credential - The credential from navigator.credentials.create()
 * @param expectedChallenge - The challenge sent to the client
 * @param expectedOrigin - The expected origin (e.g., "https://example.com")
 * @param expectedRpId - The relying party ID (e.g., "example.com")
 */
export async function verifyRegistrationCredential(
  credential: RegistrationCredential,
  expectedChallenge: string,
  expectedOrigin: string,
  expectedRpId: string,
): Promise<VerifyRegistrationResult> {
  // 1. Decode and verify clientDataJSON
  const clientDataBytes = base64urlDecode(credential.response.clientDataJSON);
  if (!clientDataBytes) {
    throw new Error("Invalid clientDataJSON encoding");
  }
  const clientData: ClientData = JSON.parse(
    new TextDecoder().decode(clientDataBytes),
  );

  if (clientData.type !== "webauthn.create") {
    throw new Error("Invalid clientData type: expected webauthn.create");
  }

  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Challenge mismatch");
  }

  if (clientData.origin !== expectedOrigin) {
    throw new Error(
      `Origin mismatch: got ${clientData.origin}, expected ${expectedOrigin}`,
    );
  }

  // 2. Decode attestationObject (CBOR)
  const attestationBytes = base64urlDecode(
    credential.response.attestationObject,
  );
  if (!attestationBytes) {
    throw new Error("Invalid attestationObject encoding");
  }
  const attestationObject = decodeCbor(attestationBytes) as Map<
    CborValue,
    CborValue
  >;

  const authData = attestationObject.get("authData") as Uint8Array;
  if (!authData) {
    throw new Error("Missing authData in attestationObject");
  }

  // 3. Parse authData
  const parsed = parseAuthData(authData);

  // 4. Verify rpIdHash
  const expectedRpIdHash = await sha256(encoder.encode(expectedRpId));
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
    transports: credential.response.transports,
  };
}

export type VerifyAuthenticationResult = {
  counter: number;
};

/**
 * Verify a WebAuthn authentication credential
 *
 * @param credential - The credential from navigator.credentials.get()
 * @param storedCredential - The stored credential to verify against
 * @param expectedChallenge - The challenge sent to the client
 * @param expectedOrigin - The expected origin
 * @param expectedRpId - The relying party ID
 */
export async function verifyAuthenticationCredential(
  credential: AuthenticationCredential,
  storedCredential: StoredCredential,
  expectedChallenge: string,
  expectedOrigin: string,
  expectedRpId: string,
): Promise<VerifyAuthenticationResult> {
  // 1. Decode and verify clientDataJSON
  const clientDataBytes = base64urlDecode(credential.response.clientDataJSON);
  if (!clientDataBytes) {
    throw new Error("Invalid clientDataJSON encoding");
  }
  const clientData: ClientData = JSON.parse(
    new TextDecoder().decode(clientDataBytes),
  );

  if (clientData.type !== "webauthn.get") {
    throw new Error("Invalid clientData type: expected webauthn.get");
  }

  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Challenge mismatch");
  }

  if (clientData.origin !== expectedOrigin) {
    throw new Error(
      `Origin mismatch: got ${clientData.origin}, expected ${expectedOrigin}`,
    );
  }

  // 2. Decode authenticatorData
  const authData = base64urlDecode(credential.response.authenticatorData);
  if (!authData) {
    throw new Error("Invalid authenticatorData encoding");
  }
  const parsed = parseAuthData(authData);

  // 3. Verify rpIdHash
  const expectedRpIdHash = await sha256(encoder.encode(expectedRpId));
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
