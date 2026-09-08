import { afterEach, expect, test, vi } from "vitest";
import { randomBase64url } from "./random-base64url";

afterEach(() => vi.restoreAllMocks());

test("randomBase64url encodes the requested number of cryptographically random bytes", () => {
  vi.spyOn(crypto, "getRandomValues").mockImplementation((buffer) => {
    if (!(buffer instanceof Uint8Array)) {
      throw new Error("Expected a byte buffer");
    }
    buffer.fill(255);
    return buffer;
  });

  expect(randomBase64url(3)).toBe("____");
  expect(randomBase64url(1)).toBe("_w");
});
