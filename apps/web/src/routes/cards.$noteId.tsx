import { createFileRoute } from "@tanstack/react-router";
import { getNote } from "../platform/api/note-api";
import { listAllWorkspaces } from "../platform/api/workspace-api";
import { CardDetailPage } from "../app/pages/CardDetailPage";

export const Route = createFileRoute("/cards/$noteId")({
  ssr: false,
  loader: async ({ params }) => {
    const note = await getNote(params.noteId);
    return { note };
  },
  component: CardDetailRoute,
});

function CardDetailRoute() {
  const { note } = Route.useLoaderData();
  return (
    <CardDetailPage
      note={note}
      loadWorkspaces={async () => {
        const page = await listAllWorkspaces({ limit: 50, snapshot: "start" });
        return page.items;
      }}
    />
  );
}
