import { createFileRoute } from "@tanstack/react-router";
import { listCategories, listCategoryWorkspaces, listRecentWorkspaces } from "../adapters/http/workspace-api";
import { HomePage } from "../pages/home/HomePage";
import { RoutePending } from "../pages/_shared/RoutePending";

type DashboardSearch = {
  category?: string;
};

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search): DashboardSearch => {
    const category = typeof search.category === "string" ? search.category.trim() : "";
    return category ? { category } : {};
  },
  loaderDeps: ({ search }) => ({ categoryId: search.category }),
  loader: async ({ deps }) => {
    const [categories, recentWorkspaces] = await Promise.all([
      listCategories(),
      listRecentWorkspaces(),
    ]);
    const initialSelectedCategoryId = deps.categoryId && categories.some((category) => category.id === deps.categoryId)
      ? deps.categoryId
      : undefined;
    const initialCategoryPage = initialSelectedCategoryId
      ? await listCategoryWorkspaces(initialSelectedCategoryId, { limit: 50 })
      : undefined;

    return { categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage };
  },
  pendingComponent: RoutePending,
  component: DashboardRoute,
});

function DashboardRoute() {
  return <HomePage {...Route.useLoaderData()} />;
}
