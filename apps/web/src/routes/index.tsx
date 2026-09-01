import { createFileRoute } from "@tanstack/react-router";
import { listProjects } from "../domain/project/api";
import { Dashboard } from "../features/dashboard/Dashboard";
import { RoutePending } from "../app/RoutePending";

export const Route = createFileRoute("/")({
  ssr: false,
  loader: () => listProjects(),
  pendingComponent: RoutePending,
  component: DashboardRoute,
});

function DashboardRoute() {
  return <Dashboard projects={Route.useLoaderData()} />;
}
