import type { CategorySummary, WorkspacePage } from "../../domain/workspace/workspace";
import { CategoryLibrary } from "../../features/library/CategoryLibrary";

export function CategoryPage({
  category,
  initialPage,
}: {
  category: CategorySummary;
  initialPage: WorkspacePage;
}) {
  return <CategoryLibrary category={category} initialPage={initialPage} />;
}
