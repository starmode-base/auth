/**
 * Framework-neutral request handler sketch over the singleton auth.
 *
 * This file shows the plumbing a binding owns and the library never touches.
 * The handler extracts the presented credential from its transport and passes
 * the value in. Created credential values come back in the result and the
 * handler writes them to its response. No framework context crosses the
 * public API in either direction.
 */
import { auth } from "./kernel-map-playground";

function presentedCredential(request: Request): string | null {
  const header = request.headers.get("authorization");

  return header !== null && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
}

export async function getViewer(request: Request): Promise<Response> {
  const viewer = await auth.session.get(presentedCredential(request));

  return Response.json(viewer);
}

export async function signInWithEmailOtp(args: {
  identifier: string;
  otp: string;
}): Promise<Response> {
  const outcome = await auth.strategies.emailOtp.authenticate(args);

  if (!outcome.success) {
    return Response.json(outcome, { status: 401 });
  }

  return Response.json(outcome);
}

export async function signOut(request: Request): Promise<Response> {
  await auth.session.end(presentedCredential(request));

  return new Response(null, { status: 204 });
}
