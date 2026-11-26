import { createFileRoute } from "@tanstack/react-router";
import { listAllWorkspaces } from "../platform/api/workspace-api";
import { batchUpdateNoteTags, listTags } from "../platform/api/tag-api";
import { CardsPage } from "../app/pages/CardsPage";

export const Route = createFileRoute("/cards/")({
  ssr: false,
  component: CardsRoute,
});

function CardsRoute() {
  return (
    <CardsPage
      loadWorkspaces={async () => {
        const page = await listAllWorkspaces({ limit: 50, snapshot: "start" });
        return page.items;
      }}
      loadTags={listTags}
      batchUpdateTags={batchUpdateNoteTags}
    />
  );
}
