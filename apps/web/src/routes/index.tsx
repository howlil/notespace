import { createFileRoute } from "@tanstack/react-router";
import { listCategories, listRecentWorkspaces } from "../adapters/http/workspace-api";
import { HomePage } from "../pages/home/HomePage";
import { RoutePending } from "../pages/_shared/RoutePending";

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
  return <HomePage {...Route.useLoaderData()} />;
}
