import { useState } from "react";
import type { CategorySummary } from "../../domain/workspace/workspace";
import { listCategories } from "../../adapters/http/workspace-api";
import { useToast } from "../../shared/ui/toast-provider";

export function useLibraryCategories(initial: CategorySummary[]) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState(initial);

  function refreshCategories() {
    void listCategories()
      .then(setCategories)
      .catch((error) => showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not refresh categories.",
      }));
  }

  return { categories, refreshCategories };
}
