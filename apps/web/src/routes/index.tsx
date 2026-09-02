import { createFileRoute } from "@tanstack/react-router";
import { listCategories, listProjects } from "../domain/project/api";
import { Dashboard } from "../features/dashboard/Dashboard";
import { RoutePending } from "../app/RoutePending";

export const Route = createFileRoute("/")({
  ssr: false,
  loader: async () => {
    const [categories, workspaces] = await Promise.all([
      listCategories(),
      listProjects(),
    ]);
    return { categories, workspaces };
  },
  pendingComponent: RoutePending,
  component: DashboardRoute,
});

function DashboardRoute() {
  return <Dashboard {...Route.useLoaderData()} />;
}
