/**
 * REST handler for auth API
 *
 * Creates route handlers that dispatch based on the `method` field in the
 * request body. Compatible with TanStack Start server routes.
 */
import type { OtpAuthResult, PasskeyAuthResult, MakeAuthResult } from "./types";
import { authBodyValidator } from "./validators";

/** TanStack Start route handler signature */
type RouteHandler = (ctx: { request: Request }) => Promise<Response>;

/** Route handlers object for TanStack Start */
type RouteHandlers = { POST: RouteHandler };

/** Accepts any valid auth variant returned by makeOtpAuth, makePasskeyAuth, or makeAuth */
type HandlerAuth = OtpAuthResult | PasskeyAuthResult | MakeAuthResult;

/** Create route handlers for auth API */
export const makeAuthHandler = (auth: HandlerAuth): RouteHandlers => {
  const handler: RouteHandler = async ({ request }) => {
    // Helper to build JSON response
    const respond = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    const notConfigured = () =>
      respond({ success: false, error: "invalid_request" }, 400);

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
          if (!("requestOtp" in auth)) return notConfigured();
          return respond(await auth.requestOtp(body.args));
        }

        case "verifyOtp": {
          if (!("verifyOtp" in auth)) return notConfigured();
          return respond(await auth.verifyOtp(body.args));
        }

        case "generateRegistrationOptions": {
          if (!("generateRegistrationOptions" in auth)) return notConfigured();
          return respond(await auth.generateRegistrationOptions(body.args));
        }

        case "verifyRegistration": {
          if (!("verifyRegistration" in auth)) return notConfigured();
          return respond(await auth.verifyRegistration(body.args));
        }

        case "generateAuthenticationOptions": {
          if (!("generateAuthenticationOptions" in auth))
            return notConfigured();
          return respond(await auth.generateAuthenticationOptions());
        }

        case "verifyAuthentication": {
          if (!("verifyAuthentication" in auth)) return notConfigured();
          return respond(await auth.verifyAuthentication(body.args));
        }

        case "signOut": {
          await auth.signOut();
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
