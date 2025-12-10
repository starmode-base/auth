import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { handler } from "./auth";

const SESSION_COOKIE = "session";

type AuthActionInput = {
  method: string;
  args: Record<string, unknown>;
};

type AuthResult =
  | { success: boolean }
  | { valid: boolean; userId?: string; token?: string }
  | { userId: string }
  | null;

export const authAction = createServerFn({ method: "POST" })
  .inputValidator((input: AuthActionInput) => input)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { method, args } = data;

    // For deleteSession, get the token from the cookie
    if (method === "deleteSession") {
      const token = getCookie(SESSION_COOKIE);
      if (token) {
        await handler("deleteSession", { token });
        setCookie(SESSION_COOKIE, "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
      }
      return { success: true };
    }

    // Call the auth handler
    const result = (await handler(method, args)) as AuthResult;

    // If verifyOtp succeeded, set the session cookie
    if (
      method === "verifyOtp" &&
      result &&
      typeof result === "object" &&
      "token" in result &&
      result.token
    ) {
      setCookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return result;
  });

export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ userId: string } | null> => {
    const token = getCookie(SESSION_COOKIE);
    if (!token) {
      return null;
    }
    const result = await handler("getSession", { token });
    return result as { userId: string } | null;
  },
);
