import { afterEach, describe, expect, it, vi } from "vitest";
import { makeAuthClient, type AuthClient } from "./index";

describe("makeAuthClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("requestOtp", () => {
    it("sends POST with method dispatch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      await auth.requestOtp({ identifier: "user@example.com" });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "requestOtp",
          args: { identifier: "user@example.com" },
        }),
      });
    });

    it("returns success response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      const result = await auth.requestOtp({ identifier: "user@example.com" });

      expect(result).toStrictEqual({ success: true });
    });
  });

  describe("verifyOtp", () => {
    it("sends POST with method dispatch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ valid: true })),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      await auth.verifyOtp({ identifier: "user@example.com", otp: "123456" });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "verifyOtp",
          args: { identifier: "user@example.com", otp: "123456" },
        }),
      });
    });

    it("returns validation response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ valid: true })),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      const result = await auth.verifyOtp({
        identifier: "user@example.com",
        otp: "123456",
      });

      expect(result).toStrictEqual({ valid: true });
    });

    it("returns invalid response for wrong otp", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ valid: false })),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      const result = await auth.verifyOtp({
        identifier: "user@example.com",
        otp: "000000",
      });

      expect(result).toStrictEqual({ valid: false });
    });
  });

  describe("generateRegistrationOptions", () => {
    it("sends POST with registration token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ options: {} })),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      await auth.generateRegistrationOptions({
        registrationToken: "reg-token-123",
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "generateRegistrationOptions",
          args: { registrationToken: "reg-token-123" },
        }),
      });
    });
  });

  describe("verifyRegistration", () => {
    it("sends POST with registration token and credential", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });
      globalThis.fetch = mockFetch;

      const mockCredential = {
        id: "cred-id",
        rawId: "raw-id",
        type: "public-key" as const,
        response: {
          clientDataJSON: "client-data",
          attestationObject: "attestation",
        },
        clientExtensionResults: {},
      };

      const auth = makeAuthClient("/api/auth");
      await auth.verifyRegistration({
        registrationToken: "reg-token-123",
        credential: mockCredential,
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "verifyRegistration",
          args: {
            registrationToken: "reg-token-123",
            credential: mockCredential,
          },
        }),
      });
    });
  });

  describe("generateAuthenticationOptions", () => {
    it("sends POST without parameters", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ options: {} })),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      await auth.generateAuthenticationOptions();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "generateAuthenticationOptions",
        }),
      });
    });
  });

  describe("verifyAuthentication", () => {
    it("sends POST with credential", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ valid: true })),
      });
      globalThis.fetch = mockFetch;

      const mockCredential = {
        id: "cred-id",
        rawId: "raw-id",
        type: "public-key" as const,
        response: {
          clientDataJSON: "client-data",
          authenticatorData: "auth-data",
          signature: "sig",
        },
        clientExtensionResults: {},
      };

      const auth = makeAuthClient("/api/auth");
      await auth.verifyAuthentication({ credential: mockCredential });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "verifyAuthentication",
          args: { credential: mockCredential },
        }),
      });
    });
  });

  describe("signOut", () => {
    it("sends POST with method dispatch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      await auth.signOut();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "signOut" }),
      });
    });

    it("handles empty response body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");
      const result = await auth.signOut();

      expect(result).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("throws on non-ok response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      globalThis.fetch = mockFetch;

      const auth = makeAuthClient("/api/auth");

      await expect(
        auth.requestOtp({ identifier: "user@example.com" }),
      ).rejects.toThrow("Auth request failed: 500 Internal Server Error");
    });
  });
});

describe("client types", () => {
  it("exports AuthClient type", async () => {
    // Type-level test: if this compiles, the types are exported correctly
    const _typeCheck = async () => {
      const { makeAuthClient } = await import("./index");
      const auth = makeAuthClient("/api/auth");

      // These should all type-check
      const _r1: { success: boolean } = await auth.requestOtp({
        identifier: "test@example.com",
      });
      const _r2: { success: boolean } = await auth.verifyOtp({
        identifier: "test@example.com",
        otp: "123456",
      });
      const _r3: void = await auth.signOut();
    };

    expect(true).toBe(true);
  });

  it("AuthClient matches makeAuthClient return type", () => {
    // Type-level test: AuthClient can be assigned from makeAuthClient
    const _typeCheck = () => {
      const auth: AuthClient = makeAuthClient("/api/auth");
      return auth;
    };

    expect(true).toBe(true);
  });
});
