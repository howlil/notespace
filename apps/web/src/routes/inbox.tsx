import { createFileRoute, redirect } from "@tanstack/react-router";

// Obsolete pre-v8 deep links resolve to the Workspace library.
// Historical records remain in durable storage and portable backups.
export const Route = createFileRoute("/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
