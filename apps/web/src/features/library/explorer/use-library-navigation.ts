import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibraryExplorer } from "./library-explorer-provider";
import {
  createCategory,
  createWorkspace,
  deleteCategory,
  deleteWorkspace,
  moveWorkspace,
  renameWorkspace,
  updateCategory,
} from "../../../adapters/http/workspace-api";
import { notifyLibraryChanged } from "../../../adapters/browser/library-change";
import { UNCATEGORIZED_CATEGORY_ID, type CategorySummary, type WorkspaceSummary } from "../../../domain/workspace/workspace";
import { workspaceRenameTitle } from "../../../domain/workspace/naming";
import { errorMessage } from "../../../shared/lib/error-message";
import { useToast } from "../../../shared/ui/feedback/toast-provider";

type CreateTarget = { kind: "category" | "workspace"; categoryId?: string };
type DeleteTarget = { kind: "category"; item: CategorySummary } | { kind: "workspace"; item: WorkspaceSummary };
export type LibraryChange = { kind: "workspace-deleted"; workspaceId: string };

type Options = {
  categories: CategorySummary[];
  selectedCategoryId?: string;
  onChanged?: (change?: LibraryChange) => void;
  onBeforeDeleteWorkspace?: (workspaceId: string) => Promise<boolean>;
};

export function useLibraryNavigation({ categories, selectedCategoryId, onChanged, onBeforeDeleteWorkspace }: Options) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { expandedCategories: expanded, setExpandedCategories: setExpanded,
    categoryPages, loadingCategories: loading, categoryErrors, loadCategory } = useLibraryExplorer();
  const children = useMemo(() => Object.fromEntries(
    Object.entries(categoryPages).map(([id, page]) => [id, page.items]),
  ), [categoryPages]);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateTarget | null>(null);
  const pendingWorkspaceCreate = useRef<{ id: string; title: string; categoryId?: string } | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [title, setTitle] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const createSubmitting = useRef(false);
  const pendingRenames = useRef(new Set<string>());
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [savingWorkspaceId, setSavingWorkspaceId] = useState<string | null>(null);
  const uncategorized =
    categories.find((category) => category.id === UNCATEGORIZED_CATEGORY_ID) ??
    categories.find((category) => category.title.toLowerCase() === "uncategorized");

  function signalLibraryChanged(change?: LibraryChange) {
    notifyLibraryChanged();
    onChanged?.(change);
  }

  useEffect(() => {
    if (selectedCategoryId) setExpanded((current) => current.has(selectedCategoryId)
      ? current : new Set(current).add(selectedCategoryId));
  }, [selectedCategoryId, setExpanded]);

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
    if (categoryErrors.has(category.id)) await loadCategory(category.id, true);
  }

  function startCreate(kind: CreateTarget["kind"], categoryId?: string) {
    if (createSubmitting.current) return;
    setTitle("");
    setCreating({ kind, categoryId });
    if (categoryId) {
      setExpanded((current) => new Set(current).add(categoryId));
    }
  }

  async function submitCreate() {
    const next = title.trim();
    if (!creating || !next || createSubmitting.current) return;
    createSubmitting.current = true;
    setCreateLoading(true);

    try {
      const target = creating;
      let createdWorkspace: WorkspaceSummary | undefined;
      if (target.kind === "category") await createCategory(next);
      else {
        const pending = pendingWorkspaceCreate.current;
        const draft = pending?.title === next && pending.categoryId === target.categoryId
          ? pending : { id: crypto.randomUUID(), title: next, categoryId: target.categoryId };
        pendingWorkspaceCreate.current = draft;
        createdWorkspace = await createWorkspace(next, target.categoryId, draft.id);
        pendingWorkspaceCreate.current = null;
      }

      setTitle("");
      setCreating(null);
      if (target.kind === "workspace" && target.categoryId) {
        setExpanded((current) => new Set(current).add(target.categoryId!));
      }
      if (createdWorkspace) {
        await navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: createdWorkspace.id }, search: { noteId: undefined } });
        notifyLibraryChanged();
      } else signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not create this item." });
    } finally {
      createSubmitting.current = false;
      setCreateLoading(false);
    }
  }

  async function saveCategory(category: CategorySummary, value: string) {
    const key = `category:${category.id}`;
    if (pendingRenames.current.has(key)) return;
    const nextTitle = value.trim();
    if (!nextTitle || nextTitle === category.title) {
      setEditingCategory(null);
      return;
    }

    pendingRenames.current.add(key);
    setSavingCategoryId(category.id);
    try {
      await updateCategory(category.id, nextTitle);
      setEditingCategory((current) => current === category.id ? null : current);
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not rename category." });
    } finally {
      pendingRenames.current.delete(key);
      setSavingCategoryId((current) => current === category.id ? null : current);
    }
  }

  async function saveWorkspace(workspace: WorkspaceSummary, value: string) {
    const key = `workspace:${workspace.id}`;
    if (pendingRenames.current.has(key)) return;
    const nextTitle = workspaceRenameTitle(value, workspace.title);
    if (!nextTitle) {
      setEditingWorkspace(null);
      return;
    }

    pendingRenames.current.add(key);
    setSavingWorkspaceId(workspace.id);
    try {
      await renameWorkspace(workspace.id, nextTitle, workspace.title);
      setEditingWorkspace((current) => current === workspace.id ? null : current);
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: errorMessage(error, "Could not rename workspace.") });
    } finally {
      pendingRenames.current.delete(key);
      setSavingWorkspaceId((current) => current === workspace.id ? null : current);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    try {
      if (target.kind === "category") {
        await deleteCategory(target.item.id);
        setExpanded((current) => {
          const next = new Set(current);
          next.delete(target.item.id);
          return next;
        });
      } else {
        if (onBeforeDeleteWorkspace && !await onBeforeDeleteWorkspace(target.item.id)) return;
        await deleteWorkspace(target.item.id, target.item.version);
      }
      setDeleting(null);
      signalLibraryChanged(target.kind === "workspace" ? { kind: "workspace-deleted", workspaceId: target.item.id } : undefined);
    } catch (error) {
      setDeleting(target);
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
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not move workspace." });
    }
  }

  return {
    children,
    categoryErrors,
    creating,
    createLoading,
    hasMore: (categoryId: string) => categoryPages[categoryId]?.nextOffset !== undefined,
    deleting,
    editingCategory,
    editingWorkspace,
    savingCategoryId,
    savingWorkspaceId,
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
    retryCategory: (categoryId: string) => loadCategory(categoryId, true),
  };
}
