import { createFileRoute } from "@tanstack/react-router";
import { getCategory, listCategories, listCategoryWorkspaces, listRecentWorkspaces } from "../domain/project/api";
import { Dashboard } from "../features/dashboard/Dashboard";
import { RoutePending } from "../components/feedback/RoutePending";

export const Route = createFileRoute("/categories/$categoryId")({
  ssr: false,
  loader: async ({ params }) => {
    const [categories, category, initialPage, recentWorkspaces] = await Promise.all([
      listCategories(),
      getCategory(params.categoryId),
      listCategoryWorkspaces(params.categoryId),
      listRecentWorkspaces(),
    ]);
    return { categories, category, initialPage, recentWorkspaces };
  },
  pendingComponent: RoutePending,
  component: CategoryRoute,
});

function CategoryRoute() {
  const data = Route.useLoaderData();
  return <Dashboard categories={data.categories} recentWorkspaces={data.recentWorkspaces} initialSelectedCategoryId={data.category.id} initialCategoryPage={data.initialPage} />;
}
