import {
  makeAuth,
  makeCookieAuth,
  makeMemoryAdapters,
  makeSessionTokenJwt,
  otpEmailMinimal,
  otpSendConsole,
} from "@starmode/auth";

const auth = makeAuth({
  ...makeMemoryAdapters(),
  ...makeSessionTokenJwt({ secret: "dev-secret", ttl: 600 }),
  email: otpEmailMinimal,
  send: otpSendConsole,
});

// Cookie helpers
const SESSION_COOKIE = "session";

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCookie(req: Request, name: string): string | null {
  const cookies = req.headers.get("cookie");
  if (!cookies) return null;

  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

function setCookieHeader(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${maxAge}`;
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
<head><title>Auth Example</title></head>
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
<head><title>Auth Example</title></head>
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
    <input name="code" type="text" placeholder="123456" required pattern="[0-9]{6}" />
    <button type="submit">Verify</button>
  </form>
</body>
</html>`;
}

// Per-request cookie state (stored during request, applied via headers)
let pendingCookie: { value: string; maxAge: number } | null = null;

// Server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    pendingCookie = null;

    // Create cookie auth with request-scoped cookie operations
    const cookieAuth = makeCookieAuth({
      auth,
      cookie: {
        get: () => getCookie(req, SESSION_COOKIE) ?? undefined,
        set: (token) => {
          pendingCookie = { value: token, maxAge: 30 * 24 * 60 * 60 };
        },
        clear: () => {
          pendingCookie = { value: "", maxAge: 0 };
        },
      },
    });

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
      const session = await cookieAuth.getSession();
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

      await cookieAuth.requestOtp(email);
      return new Response(otpPage(email), {
        headers: securityHeaders(),
      });
    }

    // Verify OTP
    if (url.pathname === "/auth/verify-otp" && req.method === "POST") {
      const form = await req.formData();

      const email = form.get("email");
      if (typeof email !== "string") {
        return new Response("Invalid email", { status: 400 });
      }

      const code = form.get("code");
      if (typeof code !== "string") {
        return new Response("Invalid code", { status: 400 });
      }

      const result = await cookieAuth.verifyOtp(email, code);

      if (result.valid) {
        return new Response(null, {
          status: 302,
          headers: addCookieHeader({ Location: "/" }),
        });
      }

      return new Response("Invalid OTP", { status: 401 });
    }

    // Sign out
    if (url.pathname === "/auth/signout" && req.method === "POST") {
      await cookieAuth.signOut();

      return new Response(null, {
        status: 302,
        headers: addCookieHeader({ Location: "/" }),
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
