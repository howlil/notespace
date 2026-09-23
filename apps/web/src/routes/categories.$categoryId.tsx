import { createFileRoute } from "@tanstack/react-router";
import { getCategory, listCategoryWorkspaces } from "../domain/project/api";
import { CategoryPage } from "../pages/category/CategoryPage";
import { RoutePending } from "../app/feedback/RoutePending";

export const Route = createFileRoute("/categories/$categoryId")({
  ssr: false,
  loader: async ({ params }) => {
    const [category, initialPage] = await Promise.all([
      getCategory(params.categoryId),
      listCategoryWorkspaces(params.categoryId, { limit: 50 }),
    ]);
    return { category, initialPage };
  },
  pendingComponent: RoutePending,
  component: CategoryRoute,
});

function CategoryRoute() {
  const data = Route.useLoaderData();
  return <CategoryPage category={data.category} initialPage={data.initialPage} />;
}
