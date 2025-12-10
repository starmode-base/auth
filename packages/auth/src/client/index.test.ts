import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  httpTransport,
  makeAuthClient,
  type AuthTransportAdapter,
} from "./index";

describe("httpTransport", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends POST request to endpoint with method and args", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    globalThis.fetch = mockFetch;

    const transport = httpTransport("/api/auth");
    await transport("requestOtp", { email: "user@example.com" });

    expect(mockFetch).toHaveBeenCalledWith("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "requestOtp",
        args: { email: "user@example.com" },
      }),
    });
  });

  it("returns parsed JSON response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    globalThis.fetch = mockFetch;

    const transport = httpTransport("/api/auth");
    const result = await transport("requestOtp", { email: "user@example.com" });

    expect(result).toEqual({ success: true });
  });

  it("throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    globalThis.fetch = mockFetch;

    const transport = httpTransport("/api/auth");

    await expect(
      transport("requestOtp", { email: "user@example.com" }),
    ).rejects.toThrow("Auth request failed: 500 Internal Server Error");
  });
});

describe("makeAuthClient", () => {
  let mockTransport: Mock<AuthTransportAdapter>;

  beforeEach(() => {
    mockTransport = vi.fn<AuthTransportAdapter>();
  });

  describe("requestOtp", () => {
    it("calls transport with requestOtp method", async () => {
      mockTransport.mockResolvedValue({ success: true });

      const client = makeAuthClient({ transport: mockTransport });
      await client.requestOtp({ email: "user@example.com" });

      expect(mockTransport).toHaveBeenCalledWith("requestOtp", {
        email: "user@example.com",
      });
    });

    it("returns success response", async () => {
      mockTransport.mockResolvedValue({ success: true });

      const client = makeAuthClient({ transport: mockTransport });
      const result = await client.requestOtp({ email: "user@example.com" });

      expect(result).toEqual({ success: true });
    });
  });

  describe("verifyOtp", () => {
    it("calls transport with verifyOtp method", async () => {
      mockTransport.mockResolvedValue({ valid: true, userId: "user_1" });

      const client = makeAuthClient({ transport: mockTransport });
      await client.verifyOtp({ email: "user@example.com", code: "123456" });

      expect(mockTransport).toHaveBeenCalledWith("verifyOtp", {
        email: "user@example.com",
        code: "123456",
      });
    });

    it("returns validation response", async () => {
      mockTransport.mockResolvedValue({ valid: true, userId: "user_1" });

      const client = makeAuthClient({ transport: mockTransport });
      const result = await client.verifyOtp({
        email: "user@example.com",
        code: "123456",
      });

      expect(result).toEqual({ valid: true, userId: "user_1" });
    });

    it("returns invalid response for wrong code", async () => {
      mockTransport.mockResolvedValue({ valid: false });

      const client = makeAuthClient({ transport: mockTransport });
      const result = await client.verifyOtp({
        email: "user@example.com",
        code: "000000",
      });

      expect(result).toEqual({ valid: false });
    });
  });

  describe("signOut", () => {
    it("calls transport with deleteSession method", async () => {
      mockTransport.mockResolvedValue(undefined);

      const client = makeAuthClient({ transport: mockTransport });
      await client.signOut();

      expect(mockTransport).toHaveBeenCalledWith("deleteSession", {});
    });
  });
});

describe("client types", () => {
  it("exports AuthClient type", async () => {
    // Type-level test: if this compiles, the types are exported correctly
    const _typeCheck = async () => {
      const { makeAuthClient, httpTransport } = await import("./index");
      const client = makeAuthClient({ transport: httpTransport("/api/auth") });

      // These should all type-check
      const _r1: { success: boolean } = await client.requestOtp({
        email: "test@example.com",
      });
      const _r2: { valid: boolean; userId?: string } = await client.verifyOtp({
        email: "test@example.com",
        code: "123456",
      });
      const _r3: void = await client.signOut();
    };

    expect(true).toBe(true);
  });
});
