import { serve } from "bun";
import index from "./index.html";
import { makeRequestAuth } from "./auth";
import { db } from "./db";

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/request-otp": {
      async POST(req) {
        const resHeaders = new Headers();
        const auth = makeRequestAuth(req, resHeaders);
        const data = await req.json();
        const result = await auth.requestOtp(data);
        return Response.json(result, { headers: resHeaders });
      },
    },

    "/api/verify-otp": {
      async POST(req) {
        const resHeaders = new Headers();
        const auth = makeRequestAuth(req, resHeaders);
        const data = await req.json();

        const result = await auth.verifyOtp(data);
        if (!result.success) {
          return Response.json({ success: false }, { headers: resHeaders });
        }

        const { userId, isNew } = db.users.upsert(data.identifier);
        const session = await auth.createSession({ userId });
        if (!session.success) {
          return Response.json({ success: false }, { headers: resHeaders });
        }

        return Response.json({ success: true, isNew }, { headers: resHeaders });
      },
    },

    "/api/change-email": {
      async POST(req) {
        const resHeaders = new Headers();
        const auth = makeRequestAuth(req, resHeaders);
        const data = await req.json();

        const session = await auth.getSession();
        if (!session) {
          return Response.json({ success: false }, { headers: resHeaders });
        }

        const result = await auth.verifyOtp(data);
        if (!result.success) {
          return Response.json({ success: false }, { headers: resHeaders });
        }

        const user = db.users.updateEmail(session.userId, data.identifier);
        if (!user) {
          return Response.json({ success: false }, { headers: resHeaders });
        }

        return Response.json(
          { success: true, viewer: user },
          { headers: resHeaders },
        );
      },
    },

    "/api/sign-out": {
      async POST(req) {
        const resHeaders = new Headers();
        const auth = makeRequestAuth(req, resHeaders);
        await auth.signOut();
        return Response.json({ success: true }, { headers: resHeaders });
      },
    },

    "/api/viewer": {
      async GET(req) {
        const resHeaders = new Headers();
        const auth = makeRequestAuth(req, resHeaders);
        const session = await auth.getSession();
        const viewer = session ? db.users.get(session.userId) : undefined;
        return Response.json(viewer ?? null, { headers: resHeaders });
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
