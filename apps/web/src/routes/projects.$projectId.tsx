import { createFileRoute } from "@tanstack/react-router";
import { getProject } from "../domain/project/api";
import { Workspace } from "../features/workspace/Workspace";
import { RoutePending } from "../app/RoutePending";

export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  loader: async ({ params }) => {
    return { project: await getProject(params.projectId) };
  },
  pendingComponent: RoutePending,
  component: ProjectRoute,
});

function ProjectRoute() {
  const data = Route.useLoaderData();
  return <Workspace key={data.project.id} {...data} />;
}
