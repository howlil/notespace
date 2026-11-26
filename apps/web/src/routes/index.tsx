import { createFileRoute, redirect } from "@tanstack/react-router";
import { UNCATEGORIZED_CATEGORY_ID } from "../entities/workspace";
import { notifyLibraryChanged } from "../platform/api/library-invalidation";
import { createWorkspace, resolveLegacyCategory } from "../platform/api/workspace-api";
import { HomePage } from "../app/pages/HomePage";

type DashboardSearch = {
  category?: string;
};

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search): DashboardSearch => {
    const category = typeof search.category === "string" ? search.category.trim() : "";
    return category ? { category } : {};
  },
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: async ({ deps }) => {
    if (deps.category) {
      if (deps.category === UNCATEGORIZED_CATEGORY_ID) {
        throw redirect({ to: "/", search: {}, replace: true });
      }
      try {
        const resolved = await resolveLegacyCategory(deps.category);
        if (resolved.workspaceId) {
          throw redirect({
            to: "/workspaces/$workspaceId",
            params: { workspaceId: resolved.workspaceId },
            search: { noteId: undefined },
            replace: true,
          });
        }
      } catch (err) {
        if (err && typeof err === "object" && "to" in err) throw err;
      }
      throw redirect({ to: "/", search: {}, replace: true });
    }
    return {};
  },
  component: WelcomeRoute,
});

function WelcomeRoute() {
  return (
    <HomePage
      onCreateWorkspace={async (title) => {
        const ws = await createWorkspace(title, null, crypto.randomUUID());
        notifyLibraryChanged();
        return ws;
      }}
    />
  );
}
