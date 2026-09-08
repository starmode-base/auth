import { base64urlEncode } from "../crypto";

/** Unguessable base64url token from byteCount random bytes */
export function randomBase64url(byteCount: number): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(byteCount)));
}
