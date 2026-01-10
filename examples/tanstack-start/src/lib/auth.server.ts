import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { makeCookieAuth } from "@starmode/auth";
import { auth } from "./auth";

const SESSION_COOKIE = "session";

const cookieAuth = makeCookieAuth({
  auth,
  cookie: {
    get: () => getCookie(SESSION_COOKIE),
    set: (token) =>
      setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      }),
    clear: () =>
      setCookie(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      }),
  },
});

// In-memory user store for this example
const users = new Map<string, { userId: string; email: string }>();
let userIdCounter = 0;

function upsertUser(email: string): { userId: string; isNew: boolean } {
  const existing = Array.from(users.values()).find((u) => u.email === email);
  if (existing) {
    return { userId: existing.userId, isNew: false };
  }
  const userId = `user_${++userIdCounter}`;
  users.set(userId, { userId, email });
  return { userId, isNew: true };
}

// ============================================================================
// OTP primitives
// ============================================================================

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((email: string) => email)
  .handler(({ data: email }) => cookieAuth.requestOtp(email));

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; code: string }) => input)
  .handler(({ data }) => cookieAuth.verifyOtp(data.email, data.code));

// ============================================================================
// Sign up flow (composed from primitives)
// ============================================================================

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; code: string }) => input)
  .handler(async ({ data }) => {
    // Verify OTP
    const { valid } = await cookieAuth.verifyOtp(data.email, data.code);
    if (!valid) {
      return { valid: false, registrationToken: undefined };
    }

    // App upserts user
    const { userId } = upsertUser(data.email);

    // Create registration token for passkey registration
    const { registrationToken } = await cookieAuth.createRegistrationToken(
      userId,
      data.email,
    );

    return { valid: true, registrationToken };
  });

// ============================================================================
// Passkey primitives
// ============================================================================

export const generateRegistrationOptions = createServerFn({ method: "POST" })
  .inputValidator((registrationToken: string) => registrationToken)
  .handler(({ data: registrationToken }) =>
    cookieAuth.generateRegistrationOptions(registrationToken),
  );

export const verifyRegistration = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { registrationToken: string; credential: unknown }) => input,
  )
  .handler(({ data }) =>
    cookieAuth.verifyRegistration(
      data.registrationToken,
      data.credential as never,
    ),
  );

export const generateAuthenticationOptions = createServerFn({
  method: "POST",
}).handler(() => cookieAuth.generateAuthenticationOptions());

export const verifyAuthentication = createServerFn({ method: "POST" })
  .inputValidator((credential: unknown) => credential)
  .handler(({ data: credential }) =>
    cookieAuth.verifyAuthentication(credential as never),
  );

// ============================================================================
// Session
// ============================================================================

export const signOut = createServerFn({ method: "POST" }).handler(() =>
  cookieAuth.signOut(),
);

export const getSession = createServerFn({ method: "GET" }).handler(() =>
  cookieAuth.getSession(),
);
