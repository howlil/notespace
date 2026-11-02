import { LibraryPageShell } from "../_shared/LibraryPageShell";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import type { CategorySummary, WorkspacePage } from "../../domain/workspace/workspace";
import { WorkspaceLibrary } from "../../features/library/WorkspaceLibrary";
import { useWorkspaceLibrary } from "../../features/library/use-workspace-library";

type Props = {
  categories: CategorySummary[];
  initialSelectedCategoryId?: string;
  initialCategoryPage?: WorkspacePage;
};

export function HomePage(props: Props) {
  const library = useWorkspaceLibrary(props);
  return (
    <LibraryPageShell
      sidebar={<LibrarySidebar categories={library.categoryItems}
        selectedCategoryId={library.selectedCategoryId}
        onSelectCategory={(id) => { void library.selectCategory(id); }}
        onChanged={library.refreshLibrary} />}
    >
      <div className="mx-auto w-full max-w-[1240px] px-6 pt-5 pb-8 max-[560px]:p-4">
        <WorkspaceLibrary model={library} />
      </div>
    </LibraryPageShell>
  );
}
