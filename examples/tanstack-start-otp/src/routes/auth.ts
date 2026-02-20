import { createFileRoute } from "@tanstack/react-router";
import { makeAuthHandler } from "@starmode/auth";
import { auth } from "../auth";

export const Route = createFileRoute("/auth")({
  server: { handlers: makeAuthHandler(auth) },
});
