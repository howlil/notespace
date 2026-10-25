import { useCallback, useEffect, useRef, useState } from "react";
import { useLibraryExplorer } from "../../shared/ui/library-explorer-provider";
import {
  createCategory,
  createWorkspace,
  deleteCategory,
  deleteWorkspace,
  listCategoryWorkspaces,
  moveWorkspace,
  renameWorkspace,
  updateCategory,
} from "../../adapters/http/workspace-api";
import { notifyLibraryChanged } from "../../adapters/browser/library-change";
import { UNCATEGORIZED_CATEGORY_ID, type CategorySummary, type WorkspaceSummary } from "../../domain/workspace/workspace";
import { workspaceRenameTitle } from "../../domain/workspace/naming";
import { errorMessage } from "../../shared/lib/error-message";
import { useToast } from "../../shared/ui/toast-provider";
import { useLibraryRevision } from "./use-library-revision";

type CreateTarget = { kind: "category" | "workspace"; categoryId?: string };
type DeleteTarget = { kind: "category"; item: CategorySummary } | { kind: "workspace"; item: WorkspaceSummary };

type Options = {
  categories: CategorySummary[];
  onSelectCategory: (categoryId: string) => void;
  onChanged?: () => void;
};

export function useLibraryNavigation({ categories, onChanged }: Options) {
  const { showToast } = useToast();
  const libraryRevision = useLibraryRevision();
  const { expandedCategories: expanded, setExpandedCategories: setExpanded } = useLibraryExplorer();
  const [children, setChildren] = useState<Record<string, WorkspaceSummary[]>>({});
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const categoryRequestIds = useRef(new Map<string, number>());
  const expandedSnapshot = useRef(expanded);
  const [categoryErrors, setCategoryErrors] = useState<Set<string>>(() => new Set());
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateTarget | null>(null);
  const pendingWorkspaceCreate = useRef<{ id: string; title: string; categoryId?: string } | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [title, setTitle] = useState("");
  const uncategorized =
    categories.find((category) => category.id === UNCATEGORIZED_CATEGORY_ID) ??
    categories.find((category) => category.title.toLowerCase() === "uncategorized");

  function signalLibraryChanged() {
    notifyLibraryChanged();
    onChanged?.();
  }

  // The Explorer remounts across routes, while the expanded categories live in
  // its shared provider. Re-fetch on mount/library changes, not on disclosure:
  // expanding a category has its own single explicit request below.
  useEffect(() => { expandedSnapshot.current = expanded; }, [expanded]);

  const loadCategoryWorkspaces = useCallback(async (categoryId: string) => {
    const requestId = (categoryRequestIds.current.get(categoryId) ?? 0) + 1;
    categoryRequestIds.current.set(categoryId, requestId);
    setLoading((current) => new Set(current).add(categoryId));
    setCategoryErrors((current) => {
      const next = new Set(current);
      next.delete(categoryId);
      return next;
    });
    try {
      const page = await listCategoryWorkspaces(categoryId, { limit: 5 });
      if (categoryRequestIds.current.get(categoryId) !== requestId) return;
      setChildren((current) => ({ ...current, [categoryId]: page.items }));
    } catch (error) {
      if (categoryRequestIds.current.get(categoryId) !== requestId) return;
      setCategoryErrors((current) => new Set(current).add(categoryId));
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not load workspaces." });
    } finally {
      if (categoryRequestIds.current.get(categoryId) === requestId) {
        setLoading((current) => {
          const next = new Set(current);
          next.delete(categoryId);
          return next;
        });
      }
    }
  }, [showToast]);

  useEffect(() => {
    for (const categoryId of expandedSnapshot.current) {
      void loadCategoryWorkspaces(categoryId);
    }
  }, [libraryRevision, loadCategoryWorkspaces]);

  async function toggleCategory(category: CategorySummary) {
    if (expanded.has(category.id)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(category.id);
        return next;
      });
      return;
    }
    setExpanded((current) => new Set(current).add(category.id));
    if (!children[category.id] || categoryErrors.has(category.id)) await loadCategoryWorkspaces(category.id);
  }

  function startCreate(kind: CreateTarget["kind"], categoryId?: string) {
    setTitle("");
    setCreating({ kind, categoryId });
    if (categoryId) {
      setExpanded((current) => new Set(current).add(categoryId));
      if (!children[categoryId] || categoryErrors.has(categoryId)) void loadCategoryWorkspaces(categoryId);
    }
  }

  async function submitCreate() {
    const next = title.trim();
    if (!creating || !next) return;

    try {
      const target = creating;
      if (target.kind === "category") await createCategory(next);
      else {
        const pending = pendingWorkspaceCreate.current;
        const draft = pending?.title === next && pending.categoryId === target.categoryId
          ? pending : { id: crypto.randomUUID(), title: next, categoryId: target.categoryId };
        pendingWorkspaceCreate.current = draft;
        await createWorkspace(next, target.categoryId, draft.id);
        pendingWorkspaceCreate.current = null;
      }

      setTitle("");
      setCreating(null);
      if (target.kind === "workspace" && target.categoryId) {
        setExpanded((current) => new Set(current).add(target.categoryId!));
      }
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not create this item." });
    }
  }

  async function saveCategory(category: CategorySummary, value: string) {
    const nextTitle = value.trim();
    if (!nextTitle || nextTitle === category.title) {
      setEditingCategory(null);
      return;
    }

    try {
      await updateCategory(category.id, nextTitle);
      setEditingCategory(null);
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not rename category." });
    }
  }

  async function saveWorkspace(workspace: WorkspaceSummary, value: string) {
    const nextTitle = workspaceRenameTitle(value, workspace.title);
    if (!nextTitle) {
      setEditingWorkspace(null);
      return;
    }

    try {
      await renameWorkspace(workspace.id, nextTitle, workspace.title);
      setEditingWorkspace(null);
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: errorMessage(error, "Could not rename workspace.") });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);

    try {
      if (target.kind === "category") {
        await deleteCategory(target.item.id);
        setChildren((current) => {
          const next = { ...current };
          delete next[target.item.id];
          return next;
        });
        setExpanded((current) => {
          const next = new Set(current);
          next.delete(target.item.id);
          return next;
        });
      } else {
        await deleteWorkspace(target.item.id, target.item.version);
        setChildren((current) =>
          Object.fromEntries(
            Object.entries(current).map(([categoryId, workspaces]) => [
              categoryId,
              workspaces.filter((workspace) => workspace.id !== target.item.id),
            ]),
          ),
        );
      }
      signalLibraryChanged();
    } catch (error) {
      showToast({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : target.kind === "category"
              ? "Delete the workspaces in this category first."
              : "Could not delete workspace.",
      });
    }
  }

  async function moveWorkspaceToCategory(categoryId: string, workspaceId: string) {
    try {
      const source = Object.values(children).flat().find((item) => item.id === workspaceId);
      await moveWorkspace(workspaceId, categoryId, source?.categoryId);
      setChildren({});
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not move workspace." });
    }
  }

  return {
    children,
    categoryErrors,
    creating,
    deleting,
    editingCategory,
    editingWorkspace,
    expanded,
    loading,
    title,
    uncategorized,
    confirmDelete,
    moveWorkspaceToCategory,
    saveCategory,
    saveWorkspace,
    setCreating,
    setDeleting,
    setEditingCategory,
    setEditingWorkspace,
    setTitle,
    startCreate,
    submitCreate,
    toggleCategory,
    retryCategory: loadCategoryWorkspaces,
  };
}
