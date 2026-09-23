import { createFileRoute } from "@tanstack/react-router";
import { getWorkspace, listCategoryWorkspaces, listCategories } from "../adapters/http/workspace-api";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";
import { RoutePending } from "../app/feedback/RoutePending";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  loader: async ({ params }) => {
    const [project, categories] = await Promise.all([
      getWorkspace(params.workspaceId),
      listCategories(),
    ]);
    const categoryPage = await listCategoryWorkspaces(project.categoryId, { sort: "name", limit: 20 });
    return {
      project,
      categoryWorkspaces: categoryPage.items,
      categoryTitle:
        categories.find((category) => category.id === project.categoryId)
          ?.title ?? "Category",
    };
  },
  pendingComponent: RoutePending,
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const data = Route.useLoaderData();
  return <WorkspacePage key={data.project.id} {...data} />;
}
