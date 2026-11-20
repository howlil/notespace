import { createFileRoute, useLocation } from "@tanstack/react-router";
import { getWorkspace, listCategories } from "../adapters/http/workspace-api";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";

type WorkspaceSearch = {
  noteId?: string;
  blockId?: string;
};

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => {
    const noteId = typeof search.noteId === "string" && search.noteId ? search.noteId : undefined;
    const blockId = typeof search.blockId === "string" && search.blockId ? search.blockId : undefined;
    return {
      ...(noteId !== undefined ? { noteId } : {}),
      ...(blockId !== undefined ? { blockId } : {}),
    };
  },
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
  const location = useLocation();
  const focusNonce = location.state.__TSR_key ?? location.href;
  return (
    <WorkspacePage
      {...data}
      focusNoteId={search.noteId}
      focusBlockId={search.blockId}
      focusNonce={focusNonce}
    />
  );
}
