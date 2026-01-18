/**
 * REST handler for auth API
 *
 * Creates route handlers that dispatch based on the `method` field in the
 * request body. Compatible with TanStack Start server routes.
 */
import type { MakeAuthResult } from "./types";
import { authBodyValidator } from "./validators";

/** TanStack Start route handler signature */
type RouteHandler = (ctx: { request: Request }) => Promise<Response>;

/** Route handlers object for TanStack Start */
type RouteHandlers = { POST: RouteHandler };

/** Create route handlers for auth API */
export const makeAuthHandler = (auth: MakeAuthResult): RouteHandlers => {
  const handler: RouteHandler = async ({ request }) => {
    // Helper to build JSON response
    const respond = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // Parse and validate request body
    let body: ReturnType<typeof authBodyValidator>;
    try {
      body = authBodyValidator(await request.json());
    } catch {
      return respond({ success: false, error: "invalid_request" }, 400);
    }

    // Dispatch to auth method
    try {
      switch (body.method) {
        case "requestOtp": {
          return respond(await auth[body.method](body.args));
        }

        case "verifyOtp": {
          return respond(await auth[body.method](body.args));
        }

        case "generateRegistrationOptions": {
          return respond(await auth[body.method](body.args));
        }

        case "verifyRegistration": {
          return respond(await auth[body.method](body.args));
        }

        case "generateAuthenticationOptions": {
          return respond(await auth[body.method]());
        }

        case "verifyAuthentication": {
          return respond(await auth[body.method](body.args));
        }

        case "signOut": {
          await auth[body.method]();
          return respond({ success: true });
        }
      }
    } catch (err) {
      // Infrastructure errors (storage, transport)
      console.error("[auth handler]", err);
      return respond({ success: false, error: "internal_error" }, 500);
    }
  };

  return { POST: handler };
};
