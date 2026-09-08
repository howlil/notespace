import { createFileRoute } from "@tanstack/react-router";
import { getProject, listAllCategoryWorkspaces, listCategories } from "../domain/project/api";
import { Workspace } from "../features/workspace/Workspace";
import { RoutePending } from "../components/feedback/RoutePending";

export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  loader: async ({ params }) => {
    const [project, categories] = await Promise.all([
      getProject(params.projectId),
      listCategories(),
    ]);
    const categoryWorkspaces = await listAllCategoryWorkspaces(project.categoryId);
    return {
      project,
      categoryWorkspaces,
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
