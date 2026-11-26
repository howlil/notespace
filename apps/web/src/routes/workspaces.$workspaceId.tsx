import { createFileRoute, useLocation } from "@tanstack/react-router";
import { getWorkspace, listAllWorkspaces } from "../platform/api/workspace-api";
import { WorkspacePage } from "../app/pages/WorkspacePage";

type WorkspaceSearch = {
  noteId?: string;
  blockId?: string;
  sectionId?: string;
};

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => {
    const noteId = typeof search.noteId === "string" && search.noteId ? search.noteId : undefined;
    const blockId = typeof search.blockId === "string" && search.blockId ? search.blockId : undefined;
    const sectionId = typeof search.sectionId === "string" && search.sectionId ? search.sectionId : undefined;
    return {
      ...(noteId !== undefined ? { noteId } : {}),
      ...(blockId !== undefined ? { blockId } : {}),
      ...(sectionId !== undefined ? { sectionId } : {}),
    };
  },
  // A new Canvas session must never load stale versioned Canvas snapshots.
  preload: false,
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ params }) => {
      const [workspace, allPage] = await Promise.all([
        getWorkspace(params.workspaceId),
        listAllWorkspaces({ limit: 50, snapshot: "start" }).catch(() => ({ items: [] })),
      ]);
      const workspaceTitles = Object.fromEntries(allPage.items.map((w) => [w.id, w.title]));
      return { workspace, workspaceTitles };
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
      workspace={data.workspace}
      workspaceTitles={data.workspaceTitles}
      focusNoteId={search.noteId}
      focusBlockId={search.blockId}
      focusSectionId={search.sectionId}
      focusNonce={focusNonce}
    />
  );
}
