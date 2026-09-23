import { createFileRoute } from "@tanstack/react-router";
import { getWorkspace, listCategoryWorkspaces, listCategories } from "../adapters/http/workspace-api";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";
import { RoutePending } from "../app/feedback/RoutePending";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  loader: async ({ params }) => {
    const [workspace, categories] = await Promise.all([
      getWorkspace(params.workspaceId),
      listCategories(),
    ]);
    const categoryPage = await listCategoryWorkspaces(workspace.categoryId, { sort: "name", limit: 20 });
    return {
      workspace,
      categoryWorkspaces: categoryPage.items,
      categoryTitle:
        categories.find((category) => category.id === workspace.categoryId)
          ?.title ?? "Category",
    };
  },
  pendingComponent: RoutePending,
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const data = Route.useLoaderData();
  return <WorkspacePage key={data.workspace.id} {...data} />;
}
