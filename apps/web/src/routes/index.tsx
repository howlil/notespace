import { createFileRoute } from "@tanstack/react-router";
import { listCategories, listRecentWorkspaces } from "../domain/project/api";
import { Dashboard } from "../features/dashboard/Dashboard";
import { RoutePending } from "../components/feedback/RoutePending";

export const Route = createFileRoute("/")({
  ssr: false,
  loader: async () => {
    const [categories, recentWorkspaces] = await Promise.all([
      listCategories(),
      listRecentWorkspaces(),
    ]);
    return { categories, recentWorkspaces };
  },
  pendingComponent: RoutePending,
  component: DashboardRoute,
});

function DashboardRoute() {
  return <Dashboard {...Route.useLoaderData()} />;
}
