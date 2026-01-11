import { describe, it, expect } from "vitest";
import { base64urlDecode, hmacSign, hmacVerify } from "./crypto";

describe("base64urlDecode", () => {
  it("returns null on invalid base64", () => {
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
