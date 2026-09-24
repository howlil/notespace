import { useEffect, useRef, useState } from "react";
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
import type { CategorySummary, WorkspaceSummary } from "../../domain/workspace/workspace";
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

export function useLibraryNavigation({ categories, onSelectCategory, onChanged }: Options) {
  const { showToast } = useToast();
  const libraryRevision = useLibraryRevision();
  const handledLibraryRevision = useRef(libraryRevision);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, WorkspaceSummary[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateTarget | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [title, setTitle] = useState("");
  const uncategorized =
    categories.find((category) => category.id === "legacy") ??
    categories.find((category) => category.title.toLowerCase() === "uncategorized");

  function signalLibraryChanged() {
    notifyLibraryChanged();
    onChanged?.();
  }

  useEffect(() => {
    if (handledLibraryRevision.current === libraryRevision) return;
    handledLibraryRevision.current = libraryRevision;
    if (!expanded.size) return;

    let active = true;
    for (const categoryId of expanded) {
      void listCategoryWorkspaces(categoryId, { limit: 5 })
        .then((page) => {
          if (active) setChildren((current) => ({ ...current, [categoryId]: page.items }));
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [expanded, libraryRevision]);

  async function toggleCategory(category: CategorySummary) {
    const next = new Set(expanded);
    if (next.has(category.id)) {
      next.delete(category.id);
      setExpanded(next);
      return;
    }

    next.add(category.id);
    setExpanded(next);
    onSelectCategory(category.id);
    if (children[category.id]) return;

    setLoading(category.id);
    try {
      const page = await listCategoryWorkspaces(category.id, { limit: 5 });
      setChildren((current) => ({ ...current, [category.id]: page.items }));
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not load workspaces." });
    } finally {
      setLoading(null);
    }
  }

  function startCreate(kind: CreateTarget["kind"], categoryId?: string) {
    setTitle("");
    setCreating({ kind, categoryId });
    if (categoryId) setExpanded((current) => new Set(current).add(categoryId));
  }

  async function submitCreate() {
    const next = title.trim();
    if (!creating || !next) return;

    try {
      const target = creating;
      if (target.kind === "category") await createCategory(next);
      else await createWorkspace(next, target.categoryId);

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
      await renameWorkspace(workspace.id, nextTitle);
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
      await moveWorkspace(workspaceId, categoryId);
      setChildren({});
      signalLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not move workspace." });
    }
  }

  return {
    children,
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
  };
}
