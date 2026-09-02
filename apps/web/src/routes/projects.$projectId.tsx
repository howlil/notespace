import { createFileRoute } from "@tanstack/react-router";
import { getProject, listCategories, listProjects } from "../domain/project/api";
import { Workspace } from "../features/workspace/Workspace";
import { RoutePending } from "../app/RoutePending";

export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  loader: async ({ params }) => {
    const [project, workspaces, categories] = await Promise.all([
      getProject(params.projectId),
      listProjects(),
      listCategories(),
    ]);
    return {
      project,
      workspaces,
      categoryTitle: categories.find((category) => category.id === project.categoryId)?.title ?? "Category",
    };
  },
  pendingComponent: RoutePending,
  component: ProjectRoute,
});

function ProjectRoute() {
  const data = Route.useLoaderData();
  return <Workspace key={data.project.id} {...data} />;
}
