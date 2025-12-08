import { describe, expect, it } from "vitest";
import {
  makeAuth,
  otpEmailAdapterMinimal,
  otpSendAdapterConsole,
  sessionTokenAdapterJwt,
} from "./index";

describe("makeAuth", () => {
  const auth = makeAuth({
    storeOtp: async () => {},
    verifyOtp: async () => true,
    upsertUser: async () => ({ userId: "user_1", isNew: true }),
    storeSession: async () => {},
    getSession: async () => ({ userId: "user_1", expiresAt: new Date() }),
    deleteSession: async () => {},
    ...sessionTokenAdapterJwt({ secret: "test", ttl: 600 }),
    email: otpEmailAdapterMinimal(),
    send: otpSendAdapterConsole(),
  });

  it("requestOtp returns success", async () => {
    const result = await auth.requestOtp("test@example.com");
    expect(result).toEqual({ success: true });
  });

  it("verifyOtp returns token and userId", async () => {
    const result = await auth.verifyOtp("test@example.com", "123456");
    expect(result.valid).toBe(true);
    expect(result.userId).toBe("user_1");
    expect(result.token).toBeDefined();
  });

  it("getSession returns userId from token", async () => {
    const { token } = await auth.verifyOtp("test@example.com", "123456");
    const session = await auth.getSession(token!);
    expect(session).toEqual({ userId: "user_1" });
  });

  it("deleteSession completes without error", async () => {
    const { token } = await auth.verifyOtp("test@example.com", "123456");
    await expect(auth.deleteSession(token!)).resolves.toBeUndefined();
  });
});
