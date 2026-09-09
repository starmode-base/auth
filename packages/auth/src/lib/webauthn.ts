import type {
  PasskeyAuthenticationCredential,
  PasskeyRegistrationCredential,
} from "../contracts";
import { base64urlDecode, base64urlEncode, sha256 } from "./crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* CBOR — the subset WebAuthn uses. All reads are bounded by the input. */

type CborValue =
  number | Uint8Array | string | CborValue[] | Map<CborValue, CborValue>;

function decodeCbor(data: Uint8Array): CborValue {
  let offset = 0;

  function read(n: number): Uint8Array {
    if (offset + n > data.length) {
      throw new Error("CBOR: input exhausted");
    }
    const slice = data.subarray(offset, offset + n);
    offset += n;
    return slice;
  }

  function readUint8(): number {
    const byte = data[offset];
    if (byte === undefined) {
      throw new Error("CBOR: input exhausted");
    }
    offset += 1;
    return byte;
  }

  function readLength(additionalInfo: number): number {
    if (additionalInfo < 24) return additionalInfo;
    if (additionalInfo === 24) return readUint8();
    if (additionalInfo === 25) {
      const bytes = read(2);
      return (bytes[0]! << 8) | bytes[1]!;
    }
    if (additionalInfo === 26) {
      const bytes = read(4);
      return (
        ((bytes[0]! << 24) |
          (bytes[1]! << 16) |
          (bytes[2]! << 8) |
          bytes[3]!) >>>
        0
      );
    }
    throw new Error("CBOR: unsupported length encoding");
  }

  function decode(): CborValue {
    const initial = readUint8();
    const majorType = initial >> 5;
    const additionalInfo = initial & 0x1f;

    switch (majorType) {
      case 0:
        return readLength(additionalInfo);
      case 1:
        return -1 - readLength(additionalInfo);
      case 2:
        return new Uint8Array(read(readLength(additionalInfo)));
      case 3:
        return decoder.decode(read(readLength(additionalInfo)));
      case 4: {
        const length = readLength(additionalInfo);
        const arr: CborValue[] = [];
        for (let i = 0; i < length; i++) arr.push(decode());
        return arr;
      }
      case 5: {
        const length = readLength(additionalInfo);
        const map = new Map<CborValue, CborValue>();
        for (let i = 0; i < length; i++) {
          const key = decode();
          const value = decode();
          map.set(key, value);
        }
        return map;
      }
      default:
        throw new Error(`CBOR: unsupported major type ${majorType}`);
    }
  }

  return decode();
}

/* Client data */

type ClientData = {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin: boolean;
};

/** Decodes and validates clientDataJSON. Malformed input returns null. */
export function parseClientData(clientDataJSON: string): ClientData | null {
  const bytes = base64urlDecode(clientDataJSON);
  if (bytes === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
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

/* Authenticator data */

type ParsedAuthData = {
  rpIdHash: Uint8Array;
  signCount: number;
  userPresent: boolean;
  credentialId: Uint8Array | null;
  coseKey: Map<CborValue, CborValue> | null;
};

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
  const attested = !!(flags & 0x40);

  let credentialId: Uint8Array | null = null;
  let coseKey: Map<CborValue, CborValue> | null = null;

  if (attested) {
    if (authData.length < 55) {
      throw new Error("Attested credential data too short");
    }
    const credIdLen = new DataView(
      authData.buffer,
      authData.byteOffset + 53,
      2,
    ).getUint16(0, false);
    if (authData.length < 55 + credIdLen) {
      throw new Error("Credential id out of bounds");
    }

    credentialId = authData.subarray(55, 55 + credIdLen);
    const decoded = decodeCbor(authData.subarray(55 + credIdLen));
    if (!(decoded instanceof Map)) {
      throw new Error("COSE key is not a map");
    }
    coseKey = decoded;
  }

  return { rpIdHash, signCount, userPresent, credentialId, coseKey };
}

/* Keys and signatures */

/** Stored public key format: 0x04 || x (32 bytes) || y (32 bytes) */
function serializeCoseKey(coseKey: Map<CborValue, CborValue>): Uint8Array {
  if (coseKey.get(1) !== 2 || coseKey.get(3) !== -7) {
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

  const result = new Uint8Array(65);
  result[0] = 0x04;
  result.set(x, 1);
  result.set(y, 33);
  return result;
}

async function importStoredKey(publicKey: Uint8Array): Promise<CryptoKey> {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("Invalid stored public key format");
  }

  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64urlEncode(publicKey.subarray(1, 33)),
      y: base64urlEncode(publicKey.subarray(33, 65)),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

/**
 * Converts a DER-encoded ECDSA signature (0x30 len 0x02 rLen r 0x02 sLen s)
 * to the raw r || s format Web Crypto expects.
 */
function derToRaw(der: Uint8Array): Uint8Array {
  function byteAt(i: number): number {
    const byte = der[i];
    if (byte === undefined) {
      throw new Error("DER signature truncated");
    }
    return byte;
  }

  if (byteAt(0) !== 0x30) {
    throw new Error("Invalid DER signature: expected sequence");
  }

  let offset = 2;

  if (byteAt(offset) !== 0x02) {
    throw new Error("Invalid DER signature: expected integer tag for r");
  }
  const rLen = byteAt(offset + 1);
  if (offset + 2 + rLen > der.length) {
    throw new Error("DER signature truncated");
  }
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;

  if (byteAt(offset) !== 0x02) {
    throw new Error("Invalid DER signature: expected integer tag for s");
  }
  const sLen = byteAt(offset + 1);
  if (offset + 2 + sLen > der.length) {
    throw new Error("DER signature truncated");
  }
  let s = der.subarray(offset + 2, offset + 2 + sLen);

  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);

  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

function arrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/* Verification */

type WebAuthnPolicy = {
  rpId: string;
  allowedOrigins: string[];
};

type RegistrationVerification = {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
};

export async function verifyRegistrationCredential(
  credential: PasskeyRegistrationCredential,
  expectedChallenge: string,
  policy: WebAuthnPolicy,
): Promise<RegistrationVerification> {
  const clientData = parseClientData(credential.response.clientDataJSON);
  if (clientData === null) {
    throw new Error("Invalid clientDataJSON");
  }
  if (clientData.type !== "webauthn.create") {
    throw new Error("Invalid clientData type: expected webauthn.create");
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Challenge mismatch");
  }
  verifyOrigin(clientData, policy.allowedOrigins);

  const attestationBytes = base64urlDecode(
    credential.response.attestationObject,
  );
  if (attestationBytes === null) {
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

  const parsed = parseAuthData(authData);

  const expectedRpIdHash = await sha256(encoder.encode(policy.rpId));
  if (!arrayEqual(parsed.rpIdHash, expectedRpIdHash)) {
    throw new Error("RP ID hash mismatch");
  }
  if (!parsed.userPresent) {
    throw new Error("User presence required");
  }
  if (parsed.credentialId === null || parsed.coseKey === null) {
    throw new Error("No credential data in authData");
  }

  return {
    credentialId: base64urlEncode(parsed.credentialId),
    publicKey: serializeCoseKey(parsed.coseKey),
    counter: parsed.signCount,
  };
}

type AuthenticationVerification = {
  counter: number;
};

export async function verifyAuthenticationCredential(
  credential: PasskeyAuthenticationCredential,
  stored: { publicKey: Uint8Array; counter: number },
  expectedChallenge: string,
  policy: WebAuthnPolicy,
): Promise<AuthenticationVerification> {
  const clientDataBytes = base64urlDecode(credential.response.clientDataJSON);
  const clientData = parseClientData(credential.response.clientDataJSON);
  if (clientDataBytes === null || clientData === null) {
    throw new Error("Invalid clientDataJSON");
  }
  if (clientData.type !== "webauthn.get") {
    throw new Error("Invalid clientData type: expected webauthn.get");
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Challenge mismatch");
  }
  verifyOrigin(clientData, policy.allowedOrigins);

  const authData = base64urlDecode(credential.response.authenticatorData);
  if (authData === null) {
    throw new Error("Invalid authenticatorData encoding");
  }
  const parsed = parseAuthData(authData);

  const expectedRpIdHash = await sha256(encoder.encode(policy.rpId));
  if (!arrayEqual(parsed.rpIdHash, expectedRpIdHash)) {
    throw new Error("RP ID hash mismatch");
  }
  if (!parsed.userPresent) {
    throw new Error("User presence required");
  }

  if (
    stored.counter !== 0 &&
    parsed.signCount !== 0 &&
    parsed.signCount <= stored.counter
  ) {
    throw new Error("Signature counter replay detected");
  }

  const clientDataHash = await sha256(clientDataBytes);
  const signedData = concat(authData, clientDataHash);
  const signature = base64urlDecode(credential.response.signature);
  if (signature === null) {
    throw new Error("Invalid signature encoding");
  }

  const publicKey = await importStoredKey(stored.publicKey);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    new Uint8Array(derToRaw(signature)),
    new Uint8Array(signedData),
  );

  if (!valid) {
    throw new Error("Invalid signature");
  }

  return { counter: parsed.signCount };
}
