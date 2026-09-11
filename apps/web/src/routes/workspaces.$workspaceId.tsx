import { createFileRoute } from "@tanstack/react-router";
import { getProject, listCategoryWorkspaces, listCategories } from "../domain/project/api";
import { Workspace } from "../features/workspace/Workspace";
import { RoutePending } from "../components/feedback/RoutePending";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  ssr: false,
  loader: async ({ params }) => {
    const [project, categories] = await Promise.all([
      getProject(params.workspaceId),
      listCategories(),
    ]);
    const categoryPage = await listCategoryWorkspaces(project.categoryId, { sort: "name", limit: 20 });
    return {
      project,
      categoryWorkspaces: categoryPage.items,
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
