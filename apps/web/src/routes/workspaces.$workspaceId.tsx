import { createFileRoute } from "@tanstack/react-router";
import { getWorkspace, listCategories } from "../adapters/http/workspace-api";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";
import { RoutePending } from "../pages/_shared/RoutePending";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  // A new Canvas session must never load stale versioned Note/Canvas snapshots.
  preload: false,
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ params }) => {
      const [workspace, categories] = await Promise.all([
        getWorkspace(params.workspaceId),
        listCategories(),
      ]);
      return { workspace, categories };
    },
  },
  pendingComponent: RoutePending,
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const data = Route.useLoaderData();
  return <WorkspacePage key={data.workspace.id} {...data} />;
}
