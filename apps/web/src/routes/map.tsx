import { createFileRoute } from "@tanstack/react-router";
import {
  listAllWorkspaces,
  listRecentWorkspaces,
  listRootWorkspaces,
} from "../platform/api/workspace-api";
import { WorkspaceMapPage } from "../app/pages/WorkspaceMapPage";

export const Route = createFileRoute("/map")({
  ssr: false,
  loader: async () => {
    const emptyPage = { items: [], offset: 0, limit: 50, total: 0, snapshot: "" };
    try {
      const [initialPage, recentWorkspaces, allPage] = await Promise.all([
        listRootWorkspaces({ limit: 50, snapshot: "start" }),
        listRecentWorkspaces(4),
        listAllWorkspaces({ limit: 100, snapshot: "start" }),
      ]);

      return {
        initialView: "roots" as const,
        initialPage,
        initialError: null as string | null,
        recentWorkspaces,
        initialAllWorkspaces: allPage.items,
      };
    } catch (error) {
      return {
        initialView: "roots" as const,
        initialPage: emptyPage,
        initialError: error instanceof Error ? error.message : "Workspace Map could not be loaded.",
        recentWorkspaces: [],
        initialAllWorkspaces: [],
      };
    }
  },
  component: MapRoute,
});

function MapRoute() {
  return <WorkspaceMapPage {...Route.useLoaderData()} />;
}
