import { serve } from "bun";
import index from "./index.html";
import { auth, emailOtp } from "./auth";
import { sessionCookie } from "./session-cookie";
import { db } from "./db";

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

        const headers = new Headers();
        sessionCookie.set(
          headers,
          result.data.session.token,
          result.data.session.expiresAt,
        );

        return Response.json(
          { success: true, isNew: result.data.user.isNew },
          { headers },
        );
      },
    },

    // Advanced: OTP for identity verification while authenticated.
    // Wire to useOtpFlow on the client to enable email changes.
    "/api/change-email": {
      async POST(req) {
        const data = await req.json();

        const identity = await auth.session.get(sessionCookie.get(req));
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
        await auth.session.end(sessionCookie.get(req));

        const headers = new Headers();
        sessionCookie.clear(headers);
        return Response.json({ success: true }, { headers });
      },
    },

    "/api/sign-out-all": {
      async POST(req) {
        const identity = await auth.session.get(sessionCookie.get(req));
        if (identity) db.sessions.deleteAllForUser(identity.userId);

        const headers = new Headers();
        sessionCookie.clear(headers);
        return Response.json({ success: true }, { headers });
      },
    },

    "/api/viewer": {
      async GET(req) {
        const identity = await auth.session.get(sessionCookie.get(req));
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
