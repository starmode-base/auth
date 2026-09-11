import { serve } from "bun";
import index from "./index.html";
import { auth, emailOtp } from "./auth";
import { db } from "./db";

/** The presented session token rides in the Authorization header */
function tokenFrom(req: Request): string | null {
  const header = req.headers.get("authorization");
  return header !== null && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
}

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/request-otp": {
      async POST(req) {
        const data = await req.json();
        const result = await auth.strategies.email.request(data);
        return Response.json(result);
      },
    },

    "/api/verify-otp": {
      async POST(req) {
        const data = await req.json();

        const result = await auth.strategies.email.authenticate(data);
        if (!result.success) {
          return Response.json({ success: false });
        }

        return Response.json({
          success: true,
          isNew: result.data.user.isNew,
          token: result.data.session.token,
        });
      },
    },

    // Advanced: OTP for identity verification while authenticated.
    // Wire to useOtpFlow on the client to enable email changes.
    "/api/change-email": {
      async POST(req) {
        const data = await req.json();

        const identity = await auth.session.get(tokenFrom(req));
        if (!identity) {
          return Response.json({ success: false });
        }

        const verified = await emailOtp.verify(data.identifier, data.otp);
        if (!verified) {
          return Response.json({ success: false });
        }

        const user = db.users.updateEmail(identity.userId, data.identifier);
        if (!user) {
          return Response.json({ success: false });
        }

        return Response.json({ success: true, viewer: user });
      },
    },

    "/api/sign-out": {
      async POST(req) {
        await auth.session.end(tokenFrom(req));
        return Response.json({ success: true });
      },
    },

    "/api/sign-out-all": {
      async POST(req) {
        const identity = await auth.session.get(tokenFrom(req));
        if (identity) db.sessions.deleteAllForUser(identity.userId);
        return Response.json({ success: true });
      },
    },

    "/api/viewer": {
      async GET(req) {
        const identity = await auth.session.get(tokenFrom(req));
        const viewer = identity ? db.users.get(identity.userId) : undefined;
        return Response.json(viewer ?? null);
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
