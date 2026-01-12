import { describe, it, expect } from "vitest";
import {
  base64urlDecode,
  base64urlEncode,
  hmacSign,
  hmacVerify,
} from "./crypto";

describe("base64url encoding/decoding", () => {
  // Note: Modern atob() is "forgiving" per WHATWG spec and accepts unpadded input.
  // All major browsers + Node.js + Bun + Deno handle missing padding correctly.
  // Only Hermes (React Native) still requires padding (not a target runtime).

  it("uses URL-safe alphabet (- and _ instead of + and /)", () => {
    // Base64url uses URL-safe chars: - instead of +, _ instead of /
    // 0xfb 0xff → standard base64: "+/8" → base64url: "-_8"
    const data = new Uint8Array([0xfb, 0xff]);
    const encoded = base64urlEncode(data);
    expect(encoded).toBe("-_8");
    expect(base64urlDecode(encoded)).toEqual(data);
  });

  it("base64urlDecode returns null for invalid base64", () => {
    expect(base64urlDecode("not!valid!base64!")).toBeNull();
  });
});

describe("hmacSign", () => {
  it("returns null on empty secret", async () => {
    expect(await hmacSign("payload", "")).toBeNull();
  });
});

describe("hmacVerify", () => {
  it("returns false on empty secret", async () => {
    expect(await hmacVerify("payload", "c2lnbmF0dXJl", "")).toBe(false);
  });
});
