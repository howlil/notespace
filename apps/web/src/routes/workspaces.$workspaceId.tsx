import { createFileRoute } from "@tanstack/react-router";
import { getWorkspace, listCategories } from "../adapters/http/workspace-api";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    noteId: typeof search.noteId === "string" ? search.noteId : undefined,
  }),
  // A new Canvas session must never load stale versioned Canvas snapshots.
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
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <WorkspacePage {...data} focusNoteId={search.noteId} />;
}
