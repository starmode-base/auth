import { describe, expect, test } from "vitest";
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

  test("uses URL-safe alphabet (- and _ instead of + and /)", () => {
    // Base64url uses URL-safe chars: - instead of +, _ instead of /
    // 0xfb 0xff → standard base64: "+/8" → base64url: "-_8"
    const data = new Uint8Array([0xfb, 0xff]);
    const encoded = base64urlEncode(data);
    expect(encoded).toBe("-_8");
    expect(base64urlDecode(encoded)).toStrictEqual(data);
  });

  test("base64urlEncode encodes a string as unpadded base64url", () => {
    expect(base64urlEncode("{}")).toBe("e30");
  });

  test("base64urlDecode returns null for invalid base64", () => {
    expect(base64urlDecode("not!valid!base64!")).toBeNull();
  });
});

describe("hmacSign", () => {
  test("returns null on empty secret", async () => {
    expect(await hmacSign("payload", "")).toBeNull();
  });
});

describe("hmacVerify", () => {
  test("returns false on empty secret", async () => {
    expect(await hmacVerify("payload", "c2lnbmF0dXJl", "")).toBe(false);
  });
});
