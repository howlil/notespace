import { createFileRoute } from "@tanstack/react-router";
import { getProject, listCategories } from "../domain/project/api";
import { Workspace } from "../features/workspace/Workspace";
import { RoutePending } from "../components/feedback/RoutePending";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  loader: async ({ params }) => {
    const [project, categories] = await Promise.all([
      getProject(params.workspaceId),
      listCategories(),
    ]);
    return {
      project,
      categoryTitle:
        categories.find((category) => category.id === project.categoryId)
          ?.title ?? "Category",
    };
  },
  pendingComponent: RoutePending,
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const data = Route.useLoaderData();
  return <Workspace key={data.project.id} {...data} />;
}
