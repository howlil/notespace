import { createFileRoute } from "@tanstack/react-router";
import { getWorkspace, listCategoryWorkspaces, listCategories } from "../adapters/http/workspace-api";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";
import { RoutePending } from "../pages/_shared/RoutePending";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  // A Workspace contains versioned Note/Canvas state. On re-entry, never
  // mount the editor using stale cached loader data while refetching in the
  // background: its Autosave would then use an obsolete optimistic version.
  preload: false,
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ params }) => {
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
  },
  pendingComponent: RoutePending,
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const data = Route.useLoaderData();
  return <WorkspacePage key={data.workspace.id} {...data} />;
}
