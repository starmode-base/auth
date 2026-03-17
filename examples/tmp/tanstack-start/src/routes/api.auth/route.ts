import { createFileRoute } from "@tanstack/react-router";
import { makeAuthHandler } from "@starmode/auth";
import { auth } from "../../lib/auth";

export const Route = createFileRoute("/api/auth")({
  server: { handlers: makeAuthHandler(auth) },
});
