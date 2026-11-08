import { LibraryPageShell } from "../shell/LibraryPageShell";
import { LibrarySidebar } from "../../features/library";
import type { CategorySummary, WorkspacePage } from "../../domain/workspace/workspace";
import { WorkspaceLibrary } from "../../features/library";
import { useWorkspaceLibrary } from "../../features/library";

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
        onSelectCategory={(id) => { void library.selectCategory(id); }} />}
    >
      <div className="mx-auto w-full max-w-[1240px] px-6 pt-5 pb-8 max-[560px]:p-4">
        <WorkspaceLibrary model={library} />
      </div>
    </LibraryPageShell>
  );
}
