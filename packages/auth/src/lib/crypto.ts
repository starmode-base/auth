export function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Malformed input decodes to null */
export function base64urlDecode(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
  return new Uint8Array(hash);
}

/** Unguessable base64url token from byteCount random bytes */
export function randomBase64url(byteCount: number): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(byteCount)));
}
