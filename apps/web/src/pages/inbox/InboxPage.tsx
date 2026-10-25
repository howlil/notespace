import { LibraryPageShell } from "../_shared/LibraryPageShell";
import { useNavigate } from "@tanstack/react-router";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import type { CategorySummary } from "../../domain/workspace/workspace";
import type { InboxProjection } from "../../domain/planning/planning";
import { UnorganizedTasks } from "../../features/planning/UnorganizedTasks";
import { CaptureQueue } from "../../features/capture/CaptureQueue";
import { useLibraryCategories } from "../../features/library/use-library-categories";

export function InboxPage({
  categories,
  initial,
}: {
  categories: CategorySummary[];
  initial: InboxProjection;
}) {
  const navigate = useNavigate();
  const { categories: categoryItems, refreshCategories } = useLibraryCategories(categories);

  return (
    <LibraryPageShell page="inbox"
      sidebar={<LibrarySidebar categories={categoryItems} inboxActive onChanged={refreshCategories}
        onSelectCategory={(categoryId) => { void navigate({ to: "/", search: { category: categoryId } }); }} />}
    >
      <CaptureQueue />
      {initial.tasks.length > 0 && <UnorganizedTasks initial={initial} />}
    </LibraryPageShell>
  );
}
