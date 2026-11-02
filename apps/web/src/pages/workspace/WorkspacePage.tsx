import { useNavigate, useRouter } from "@tanstack/react-router";
import type { CategorySummary, Workspace } from "../../domain/workspace/workspace";
import { LibraryPageShell } from "../_shared/LibraryPageShell";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import { useWorkspaceAuthoring } from "../../features/workspace-authoring/ui/WorkspaceAuthoring";

type Props = {
  workspace: Workspace;
  categories: CategorySummary[];
};

export function WorkspacePage({ workspace, categories }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const authoring = useWorkspaceAuthoring({ workspace });
  const saveLabel = authoring.status.state === "saved" ? "Saved"
    : authoring.status.state === "saving" ? "Saving…"
    : authoring.status.state === "conflict" ? "Conflict"
    : authoring.status.state === "error" ? "Not saved" : "Unsaved";

  return (
    <LibraryPageShell canvas
      sidebar={<LibrarySidebar categories={categories}
        selectedCategoryId={workspace.categoryId}
        onSelectCategory={(category) => { void navigate({ to: "/", search: { category } }); }}
        onChanged={() => { void router.invalidate(); }} />}>
      <div className="h-full min-h-0 min-w-0 overflow-hidden" aria-label={authoring.currentWorkspaceTitle}>
        {authoring.authoringVisible}
        <span className="sr-only" role="status" aria-label="Workspace save status"
          aria-live="polite" aria-atomic="true">{saveLabel}</span>
      </div>
      {authoring.overlays}
    </LibraryPageShell>
  );
}
