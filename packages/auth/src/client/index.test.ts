import { afterEach, describe, expect, it, vi } from "vitest";
import { httpClient, type AuthClient } from "./index";

describe("httpClient", () => {
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

      const auth = httpClient("/api/auth");
      await auth.requestOtp("user@example.com");

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "requestOtp",
          email: "user@example.com",
        }),
      });
    });

    it("returns success response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });
      globalThis.fetch = mockFetch;

      const auth = httpClient("/api/auth");
      const result = await auth.requestOtp("user@example.com");

      expect(result).toEqual({ success: true });
    });
  });

  describe("verifyOtp", () => {
    it("sends POST with method dispatch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ valid: true })),
      });
      globalThis.fetch = mockFetch;

      const auth = httpClient("/api/auth");
      await auth.verifyOtp("user@example.com", "123456");

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "verifyOtp",
          email: "user@example.com",
          code: "123456",
        }),
      });
    });

    it("returns validation response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ valid: true })),
      });
      globalThis.fetch = mockFetch;

      const auth = httpClient("/api/auth");
      const result = await auth.verifyOtp("user@example.com", "123456");

      expect(result).toEqual({ valid: true });
    });

    it("returns invalid response for wrong code", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ valid: false })),
      });
      globalThis.fetch = mockFetch;

      const auth = httpClient("/api/auth");
      const result = await auth.verifyOtp("user@example.com", "000000");

      expect(result).toEqual({ valid: false });
    });
  });

  describe("generateRegistrationOptions", () => {
    it("sends POST with registration token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ options: {} })),
      });
      globalThis.fetch = mockFetch;

      const auth = httpClient("/api/auth");
      await auth.generateRegistrationOptions("reg-token-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "generateRegistrationOptions",
          registrationToken: "reg-token-123",
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

      const auth = httpClient("/api/auth");
      await auth.verifyRegistration("reg-token-123", mockCredential);

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "verifyRegistration",
          registrationToken: "reg-token-123",
          credential: mockCredential,
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

      const auth = httpClient("/api/auth");
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

      const auth = httpClient("/api/auth");
      await auth.verifyAuthentication(mockCredential);

      expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "verifyAuthentication",
          credential: mockCredential,
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

      const auth = httpClient("/api/auth");
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

      const auth = httpClient("/api/auth");
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

      const auth = httpClient("/api/auth");

      await expect(auth.requestOtp("user@example.com")).rejects.toThrow(
        "Auth request failed: 500 Internal Server Error",
      );
    });
  });
});

describe("client types", () => {
  it("exports AuthClient type", async () => {
    // Type-level test: if this compiles, the types are exported correctly
    const _typeCheck = async () => {
      const { httpClient } = await import("./index");
      const auth = httpClient("/api/auth");

      // These should all type-check
      const _r1: { success: boolean } =
        await auth.requestOtp("test@example.com");
      const _r2: { valid: boolean } = await auth.verifyOtp(
        "test@example.com",
        "123456",
      );
      const _r3: void = await auth.signOut();
    };

    expect(true).toBe(true);
  });

  it("AuthClient matches httpClient return type", () => {
    // Type-level test: AuthClient can be assigned from httpClient
    const _typeCheck = () => {
      const auth: AuthClient = httpClient("/api/auth");
      return auth;
    };

    expect(true).toBe(true);
  });
});
