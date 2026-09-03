import { createFileRoute } from "@tanstack/react-router";
import { getCategory, listCategoryWorkspaces } from "../domain/project/api";
import { CategoryDetail } from "../features/category/CategoryDetail";
import { RoutePending } from "../app/RoutePending";

export const Route = createFileRoute("/categories/$categoryId")({
  ssr: false,
  loader: async ({ params }) => {
    const [category, initialPage] = await Promise.all([getCategory(params.categoryId), listCategoryWorkspaces(params.categoryId)]);
    return { category, initialPage };
  },
  pendingComponent: RoutePending,
  component: CategoryRoute,
});

function CategoryRoute() { return <CategoryDetail {...Route.useLoaderData()} />; }
