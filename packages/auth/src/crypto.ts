/**
 * Crypto primitives using Web Crypto API
 *
 * All functions work in browsers, Node.js 18+, Bun, and Deno.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encode bytes to base64url string */
export function base64urlEncode(data: Uint8Array): string {
  const binary = String.fromCharCode(...data);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode base64url string to bytes */
export function base64urlDecode(str: string): Uint8Array | null {
  try {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Convert base64url string to ArrayBuffer */
export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const bytes = base64urlDecode(base64url);
  // Invariant: base64urlDecode only returns null for malformed input; WebAuthn options from server are well-formed
  if (!bytes) throw new Error("Invalid base64url string");
  // Create a fresh ArrayBuffer (not SharedArrayBuffer) for WebAuthn API compatibility
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

/** Convert ArrayBuffer to base64url string */
export function bufferToBase64url(buffer: ArrayBuffer): string {
  return base64urlEncode(new Uint8Array(buffer));
}

/** Compute SHA-256 hash of data */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Create a fresh ArrayBuffer to satisfy TypeScript's BufferSource type
  const buffer = new Uint8Array(data).buffer;
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(hash);
}

/** Import a secret string as an HMAC-SHA256 key */
async function importHmacKey(
  secret: string,
  usages: KeyUsage[],
): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      usages,
    );
  } catch {
    return null;
  }
}

/** Sign a payload string with HMAC-SHA256, return base64url signature */
export async function hmacSign(
  payload: string,
  secret: string,
): Promise<string | null> {
  const key = await importHmacKey(secret, ["sign"]);
  if (!key) return null;

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  return base64urlEncode(new Uint8Array(signature));
}

/** Verify an HMAC-SHA256 signature (constant-time comparison) */
export async function hmacVerify(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const sigBytes = base64urlDecode(signature);
  if (!sigBytes) return false;

  const key = await importHmacKey(secret, ["verify"]);
  if (!key) return false;

  // Create a new ArrayBuffer to satisfy TypeScript's BufferSource type
  const sigBuffer = new Uint8Array(sigBytes).buffer;
  return crypto.subtle.verify("HMAC", key, sigBuffer, encoder.encode(payload));
}

/** Encode a JSON payload to base64url */
export function encodePayload<T extends object>(payload: T): string {
  return base64urlEncode(encoder.encode(JSON.stringify(payload)));
}

/** Decode a base64url string to JSON payload */
export function decodePayload<T>(encoded: string): T | null {
  const bytes = base64urlDecode(encoded);
  if (!bytes) return null;
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
}
