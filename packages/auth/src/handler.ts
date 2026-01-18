/**
 * REST handler for auth API
 *
 * Creates route handlers that dispatch based on the `fn` field in the request
 * body. Compatible with TanStack Start server routes.
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
      switch (body.fn) {
        case "requestOtp": {
          return respond(await auth[body.fn](body.identifier));
        }

        case "verifyOtp": {
          return respond(await auth[body.fn](body.identifier, body.otp));
        }

        case "generateRegistrationOptions": {
          return respond(await auth[body.fn](body.registrationToken));
        }

        case "verifyRegistration": {
          return respond(
            await auth[body.fn](body.registrationToken, body.credential),
          );
        }

        case "generateAuthenticationOptions": {
          return respond(await auth[body.fn]());
        }

        case "verifyAuthentication": {
          return respond(await auth[body.fn](body.credential));
        }

        case "getSession": {
          const session = await auth[body.fn]();

          return respond(
            session
              ? { success: true, session }
              : { success: true, session: null },
          );
        }

        case "signOut": {
          await auth[body.fn]();
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
