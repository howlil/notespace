import { createFileRoute } from "@tanstack/react-router";
import { getProject, listProjects } from "../domain/project/api";
import { Workspace } from "../features/workspace/Workspace";
import { RoutePending } from "../app/RoutePending";

export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  loader: async ({ params }) => {
    const [project, projects] = await Promise.all([
      getProject(params.projectId),
      listProjects(),
    ]);
    return { project, projects };
  },
  pendingComponent: RoutePending,
  component: ProjectRoute,
});

function ProjectRoute() {
  const data = Route.useLoaderData();
  return <Workspace key={data.project.id} {...data} />;
}
