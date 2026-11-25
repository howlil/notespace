import { openAppSettings } from "../shell/app-shell-store";
import { WorkspaceLibrary, useWorkspaceLibrary } from "../../modules/library";
import type { CategorySummary, WorkspacePage } from "../../entities/workspace";

type Props = {
  categories: CategorySummary[];
  initialSelectedCategoryId?: string;
  initialCategoryPage?: WorkspacePage;
};

export function HomePage(props: Props) {
  const library = useWorkspaceLibrary(props);
  return (
    <div className="mx-auto w-full max-w-[1240px] px-6 pt-7 pb-8 max-[760px]:pt-12 max-[560px]:p-4 max-[560px]:pt-12">
      <WorkspaceLibrary model={library} onOpenDataSettings={() => openAppSettings("data")} />
    </div>
  );
}
