import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useMatches, useNavigate, useRouter } from "@tanstack/react-router";
import type { CategorySummary, Workspace } from "../../entities/workspace";
import { useStore } from "../../shared/lib/use-store";
import { LibrarySidebar } from "../../modules/library";
import { LibraryPageShell } from "./LibraryPageShell";
import { activeWorkspaceStore, prepareActiveWorkspaceForDelete } from "./active-workspace-store";

type Props = {
  children: ReactNode;
};

type HomeLoaderData = {
  categories?: CategorySummary[];
};

type WorkspaceLoaderData = {
  workspace?: Workspace;
  categories?: CategorySummary[];
};

export function PersistentAppShell({ children }: Props) {
  const matches = useMatches();
  const navigate = useNavigate();
  const router = useRouter();
  const activeSession = useStore(activeWorkspaceStore, (state) => state.session);
  const lastCategoriesRef = useRef<CategorySummary[]>([]);

  const workspaceMatch = matches.find((match) => match.routeId === "/workspaces/$workspaceId");
  const homeMatch = matches.find((match) => match.routeId === "/");
  const isCanvasRoute = Boolean(workspaceMatch);

  const workspaceLoaderData = workspaceMatch?.loaderData as WorkspaceLoaderData | undefined;
  const homeLoaderData = homeMatch?.loaderData as HomeLoaderData | undefined;

  const matchedCategories = workspaceLoaderData?.categories ?? homeLoaderData?.categories;
  useEffect(() => {
    if (matchedCategories) lastCategoriesRef.current = matchedCategories;
  }, [matchedCategories]);
  const categories = matchedCategories ?? lastCategoriesRef.current;

  const homeSearch = homeMatch?.search as { category?: unknown } | undefined;
  const selectedCategoryId = isCanvasRoute
    ? workspaceLoaderData?.workspace?.categoryId
    : typeof homeSearch?.category === "string"
      ? homeSearch.category
      : undefined;

  const routeWorkspace = workspaceLoaderData?.workspace;
  const activeWorkspace = useMemo(() => {
    if (!routeWorkspace) return undefined;
    const liveVersion = activeSession?.workspaceId === routeWorkspace.id ? activeSession.version : routeWorkspace.version;
    return { ...routeWorkspace, version: Math.max(routeWorkspace.version, liveVersion) };
  }, [activeSession, routeWorkspace]);

  const beforeDeleteWorkspace = useCallback(
    (workspaceId: string) => prepareActiveWorkspaceForDelete(workspaceId),
    [],
  );

  return (
    <LibraryPageShell
      canvas={isCanvasRoute}
      sidebar={(
        <LibrarySidebar
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          activeWorkspace={activeWorkspace}
          onSelectCategory={(category) => { void navigate({ to: "/", search: { category } }); }}
          onBeforeDeleteWorkspace={beforeDeleteWorkspace}
          onChanged={(change) => {
            if (change?.kind === "workspace-deleted" && activeWorkspace && change.workspaceId === activeWorkspace.id) {
              void navigate({ to: "/" });
            } else {
              void router.invalidate();
            }
          }}
        />
      )}
    >
      {children}
    </LibraryPageShell>
  );
}
