import { createFileRoute, redirect } from "@tanstack/react-router";

// Obsolete pre-v8 deep links resolve to the Workspace library.
export const Route = createFileRoute("/today")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
