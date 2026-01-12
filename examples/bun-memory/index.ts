import {
  makeAuth,
  storageMemory,
  sessionHmac,
  registrationHmac,
  otpTransportConsole,
  sessionTransportCookie,
  sessionCookieDefaults,
} from "@starmode/auth";

// Cookie helpers
const SESSION_COOKIE = "session";

function getCookieFromRequest(req: Request, name: string): string | undefined {
  const cookies = req.headers.get("cookie");
  if (!cookies) return undefined;

  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1];
}

function setCookieHeader(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${maxAge}`;
}

// Per-request cookie state (stored during request, applied via headers)
let pendingCookie: { value: string; maxAge: number } | null = null;

// Create auth with request-scoped cookie operations
function createAuthForRequest(req: Request) {
  pendingCookie = null;

  return makeAuth({
    storage: storageMemory(),
    sessionCodec: sessionHmac({ secret: "dev-secret", ttl: 600 }),
    registrationCodec: registrationHmac({
      secret: "dev-secret",
      ttl: 300,
    }),
    otpTransport: otpTransportConsole,
    webauthn: {
      rpId: "localhost",
      rpName: "Bun Memory Example",
    },
    sessionTransport: sessionTransportCookie({
      get: (name) => getCookieFromRequest(req, name),
      set: (name, value, opts) => {
        pendingCookie = { value, maxAge: opts.maxAge };
      },
      clear: (name, opts) => {
        pendingCookie = { value: "", maxAge: 0 };
      },
      options: { ...sessionCookieDefaults, cookieName: SESSION_COOKIE },
    }),
    debug: true,
  });
}

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

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function securityHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/html",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'none'; object-src 'none'",
  };
}

// HTML pages
function homePage(session: { userId: string } | null) {
  if (session) {
    const safeUserId = escapeHtml(session.userId);
    return `<!DOCTYPE html>
<html>
<head><title>ΛUTH Example</title></head>
<body>
  <h1>Authenticated</h1>
  <p>User ID: ${safeUserId}</p>
  <form method="POST" action="/auth/signout">
    <button type="submit">Sign Out</button>
  </form>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
<head><title>ΛUTH Example</title></head>
<body>
  <h1>Sign In</h1>
  <form method="POST" action="/auth/request-otp">
    <input name="email" type="email" placeholder="Email" required />
    <button type="submit">Send OTP</button>
  </form>
</body>
</html>`;
}

function otpPage(email: string) {
  const safeEmail = escapeHtml(email);
  return `<!DOCTYPE html>
<html>
<head><title>Enter OTP</title></head>
<body>
  <h1>Check your console for OTP</h1>
  <form method="POST" action="/auth/verify-otp">
    <input name="email" type="hidden" value="${safeEmail}" />
    <input name="otp" type="text" placeholder="123456" required pattern="[0-9]{6}" />
    <button type="submit">Verify OTP</button>
  </form>
</body>
</html>`;
}

function registerPasskeyPage(registrationToken: string) {
  // In a real app, this would trigger WebAuthn
  return `<!DOCTYPE html>
<html>
<head><title>Register Passkey</title></head>
<body>
  <h1>Register Passkey</h1>
  <p>OTP verified! In a real app, WebAuthn would prompt for passkey registration.</p>
  <p>Registration token: ${escapeHtml(registrationToken.substring(0, 20))}...</p>
  <p><a href="/">Return to home</a> (session not created - passkey required)</p>
</body>
</html>`;
}

// Server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const auth = createAuthForRequest(req);

    // Helper to add pending cookie to response
    const addCookieHeader = (
      headers: Record<string, string>,
    ): Record<string, string> => {
      if (pendingCookie) {
        return {
          ...headers,
          "Set-Cookie": setCookieHeader(
            SESSION_COOKIE,
            pendingCookie.value,
            pendingCookie.maxAge,
          ),
        };
      }
      return headers;
    };

    // Home page
    if (url.pathname === "/" && req.method === "GET") {
      const session = await auth.getSession();
      return new Response(homePage(session), {
        headers: securityHeaders(),
      });
    }

    // Request OTP
    if (url.pathname === "/auth/request-otp" && req.method === "POST") {
      const form = await req.formData();
      const email = form.get("email");

      if (typeof email !== "string") {
        return new Response("Invalid email", { status: 400 });
      }

      await auth.requestOtp(email);
      return new Response(otpPage(email), {
        headers: securityHeaders(),
      });
    }

    // Verify OTP → create registration token → prompt for passkey
    if (url.pathname === "/auth/verify-otp" && req.method === "POST") {
      const form = await req.formData();

      const email = form.get("email");
      if (typeof email !== "string") {
        return new Response("Invalid email", { status: 400 });
      }

      const otp = form.get("otp");
      if (typeof otp !== "string") {
        return new Response("Invalid OTP", { status: 400 });
      }

      const result = await auth.verifyOtp(email, otp);

      if (result.success) {
        // App upserts user
        const { userId } = upsertUser(email);

        // Create registration token for passkey registration
        const { registrationToken } = await auth.createRegistrationToken(
          userId,
          email,
        );

        // In a real app, redirect to passkey registration flow
        return new Response(registerPasskeyPage(registrationToken), {
          headers: securityHeaders(),
        });
      }

      return new Response("Invalid OTP", { status: 401 });
    }

    // Sign out
    if (url.pathname === "/auth/signout" && req.method === "POST") {
      await auth.signOut();

      return new Response(null, {
        status: 302,
        headers: addCookieHeader({ Location: "/" }),
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
