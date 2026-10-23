import { LibraryPageShell } from "../_shared/LibraryPageShell";
import { useNavigate } from "@tanstack/react-router";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import type { CategorySummary } from "../../domain/workspace/workspace";
import type { InboxProjection } from "../../domain/planning/planning";
import { InboxPlanning } from "../../features/planning/InboxPlanning";
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
      <section aria-label="Legacy standalone tasks" className="mt-8 border-t border-line">
        <div className="mx-auto max-w-[820px] px-6 pt-5 text-[11px] text-muted max-[560px]:px-4">
          <strong className="text-ink">Existing standalone Inbox tasks</strong>
          <p className="mt-1">Legacy tasks remain available while Workspace assignment is prepared in M3.</p>
        </div>
        <InboxPlanning initial={initial} />
      </section>
    </LibraryPageShell>
  );
}
