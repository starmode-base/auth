/**
 * Crypto primitives using Web Crypto API
 *
 * All functions work in browsers, Node.js 18+, Bun, and Deno.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// =============================================================================
// Base64url encoding
// =============================================================================

/** Encode bytes to base64url string */
export function base64urlEncode(data: Uint8Array): string {
  const binary = String.fromCharCode(...data);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode base64url string to bytes */
export function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// =============================================================================
// HMAC signing
// =============================================================================

/** Import a secret string as an HMAC-SHA256 key */
async function importHmacKey(
  secret: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

/** Sign a payload string with HMAC-SHA256, return base64url signature */
export async function hmacSign(
  payload: string,
  secret: string,
): Promise<string> {
  const key = await importHmacKey(secret, ["sign"]);
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
  const key = await importHmacKey(secret, ["verify"]);
  const sigBytes = base64urlDecode(signature);
  // Create a new ArrayBuffer to satisfy TypeScript's BufferSource type
  const sigBuffer = new Uint8Array(sigBytes).buffer;
  return crypto.subtle.verify("HMAC", key, sigBuffer, encoder.encode(payload));
}

// =============================================================================
// Token helpers
// =============================================================================

/** Encode a JSON payload to base64url */
export function encodePayload<T extends object>(payload: T): string {
  return base64urlEncode(encoder.encode(JSON.stringify(payload)));
}

/** Decode a base64url string to JSON payload */
export function decodePayload<T>(encoded: string): T | null {
  try {
    return JSON.parse(decoder.decode(base64urlDecode(encoded)));
  } catch {
    return null;
  }
}
