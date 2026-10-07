import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { CategorySummary, WorkspaceSummary, WorkspacePage } from "../../domain/workspace/workspace";
import { createWorkspace, deleteWorkspace, listAllWorkspaces, listCategories, listCategoryWorkspaces, listRecentWorkspaces, renameWorkspace } from "../../adapters/http/workspace-api";
import { notifyLibraryChanged } from "../../adapters/browser/library-change";
import { useLibraryRevision } from "./use-library-revision";
import { workspaceRenameTitle } from "../../domain/workspace/naming";
import { errorMessage } from "../../shared/lib/error-message";
import { useToast } from "../../shared/ui/toast-provider";

export type LibraryView = "recent" | "all" | "category";

export type UseWorkspaceLibraryOptions = {
  categories: CategorySummary[];
  recentWorkspaces: WorkspaceSummary[];
  initialSelectedCategoryId?: string;
  initialCategoryPage?: WorkspacePage;
};

export function useWorkspaceLibrary({ categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage }: UseWorkspaceLibraryOptions) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const libraryRevision = useLibraryRevision();
  const handledLibraryRevision = useRef(libraryRevision);
  const pageRequestGeneration = useRef(0);
  const [view, setView] = useState<LibraryView>(initialSelectedCategoryId ? "category" : "recent");
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialSelectedCategoryId ?? "");
  const [categoryItems, setCategoryItems] = useState(categories);
  const [recentItems, setRecentItems] = useState(recentWorkspaces);
  const [page, setPage] = useState<WorkspacePage | null>(initialCategoryPage ?? null);
  const [pageLoading, setPageLoading] = useState(false);
  const selectedCategory = useMemo(() => categoryItems.find((category) => category.id === selectedCategoryId), [categoryItems, selectedCategoryId]);

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [recentlyCreatedWorkspaceId, setRecentlyCreatedWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState("");
  const [savingWorkspaceId, setSavingWorkspaceId] = useState<string | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceSummary | null>(null);
  const workspaceRenameSubmitting = useRef(false);
  const workspaceRenameCancelled = useRef(false);

  const newWorkspaceCategoryId = useMemo(() => {
    if (view === "category" && selectedCategoryId) return selectedCategoryId;
    return (categoryItems.find((c) => c.id === "legacy") ?? categoryItems.find((c) => c.title.toLowerCase() === "uncategorized"))?.id;
  }, [view, selectedCategoryId, categoryItems]);

  async function handleCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    const title = newWorkspaceTitle.trim();
    if (!title) return;
    setCreateLoading(true);
    try {
      const workspace = await createWorkspace(title, newWorkspaceCategoryId);
      setRecentlyCreatedWorkspaceId(workspace.id);

      if (view === "recent") {
        setRecentItems((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)].slice(0, 20));
      } else {
        setPage((current) => current ? {
          ...current,
          items: [workspace, ...current.items.filter((item) => item.id !== workspace.id)].slice(0, current.limit),
          total: current.items.some((item) => item.id === workspace.id) ? current.total : current.total + 1,
        } : current);
      }

      setNewWorkspaceTitle("");
      setCreatingWorkspace(false);
      refreshLibrary({ silent: true });
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not create workspace." });
    } finally {
      setCreateLoading(false);
    }
  }

  function beginWorkspaceRename(workspace: WorkspaceSummary) {
    workspaceRenameCancelled.current = false;
    setEditingWorkspaceId(workspace.id);
    setWorkspaceTitleDraft(workspace.title);
  }

  function cancelWorkspaceRename() {
    if (workspaceRenameSubmitting.current) return;
    workspaceRenameCancelled.current = true;
    setEditingWorkspaceId(null);
    setWorkspaceTitleDraft("");
  }

  function replaceWorkspaceInLists(updated: WorkspaceSummary) {
    const replace = (workspace: WorkspaceSummary) => workspace.id === updated.id ? { ...workspace, ...updated } : workspace;
    setRecentItems((current) => current.map(replace));
    setPage((current) => current ? { ...current, items: current.items.map(replace) } : current);
  }

  async function saveWorkspaceTitle(workspace: WorkspaceSummary) {
    if (workspaceRenameSubmitting.current) return;
    if (workspaceRenameCancelled.current) {
      workspaceRenameCancelled.current = false;
      return;
    }
    const value = workspaceRenameTitle(workspaceTitleDraft, workspace.title);
    if (!value) {
      cancelWorkspaceRename();
      return;
    }
    workspaceRenameSubmitting.current = true;
    setSavingWorkspaceId(workspace.id);
    try {
      const renamed = await renameWorkspace(workspace.id, value);
      replaceWorkspaceInLists(renamed);
      setEditingWorkspaceId(null);
      setWorkspaceTitleDraft("");
      workspaceRenameCancelled.current = false;
      notifyLibraryChanged();
      showToast({ kind: "success", message: "Workspace renamed." });
    } catch (err) {
      showToast({ kind: "error", message: errorMessage(err, "Could not rename workspace.") });
    } finally {
      workspaceRenameSubmitting.current = false;
      setSavingWorkspaceId(null);
    }
  }

  async function confirmDeleteWorkspace() {
    if (!deletingWorkspace) return;
    const target = deletingWorkspace;
    setDeletingWorkspace(null);
    try {
      await deleteWorkspace(target.id, target.version);
      setRecentItems((current) => current.filter((workspace) => workspace.id !== target.id));
      setPage((current) => {
        if (!current) return current;
        const items = current.items.filter((workspace) => workspace.id !== target.id);
        return items.length === current.items.length ? current : { ...current, items, total: Math.max(0, current.total - 1) };
      });
      if (editingWorkspaceId === target.id) cancelWorkspaceRename();
      notifyLibraryChanged();
      showToast({ kind: "success", message: "Workspace deleted." });
    } catch (err) {
      showToast({ kind: "error", message: errorMessage(err, "Could not delete workspace.") });
    }
  }

  async function selectCategory(id: string, force = false) {
    if (id === selectedCategoryId && !force) return;
    const generation = ++pageRequestGeneration.current;
    setSelectedCategoryId(id);
    setView("category");
    setPageLoading(true);
    void navigate({ to: "/", search: { category: id }, replace: true });
    try {
      const result = await listCategoryWorkspaces(id, { limit: 50 });
      if (pageRequestGeneration.current === generation) setPage(result);
    } catch (err) {
      if (pageRequestGeneration.current === generation) {
        showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load category workspaces." });
      }
    } finally {
      if (pageRequestGeneration.current === generation) setPageLoading(false);
    }
  }

  function openRecent() {
    pageRequestGeneration.current += 1;
    setView("recent");
    setSelectedCategoryId("");
    setPage(null);
    setPageLoading(false);
    void navigate({ to: "/", search: {}, replace: true });
  }

  async function openAll(offset = 0) {
    const generation = ++pageRequestGeneration.current;
    setView("all");
    setSelectedCategoryId("");
    setPageLoading(true);
    void navigate({ to: "/", search: {}, replace: true });
    try {
      const result = await listAllWorkspaces({ offset, limit: 50 });
      if (pageRequestGeneration.current === generation) setPage(result);
    } catch (err) {
      if (pageRequestGeneration.current === generation) {
        showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load workspaces." });
      }
    } finally {
      if (pageRequestGeneration.current === generation) setPageLoading(false);
    }
  }

  const refreshLibrary = useCallback((options: { silent?: boolean } = {}) => {
    const silent = options.silent ?? false;
    const generation = view === "recent" ? null : ++pageRequestGeneration.current;
    void listRecentWorkspaces(20)
      .then(setRecentItems)
      .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." }));

    if (view === "all") {
      if (!silent) setPageLoading(true);
      void listAllWorkspaces({ limit: 50 })
        .then((result) => {
          if (generation === pageRequestGeneration.current) setPage(result);
        })
        .catch((err) => {
          if (generation === pageRequestGeneration.current) {
            showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." });
          }
        })
        .finally(() => {
          if (!silent && generation === pageRequestGeneration.current) setPageLoading(false);
        });
    }

    if (view === "category" && selectedCategoryId && !silent) setPageLoading(true);
    void listCategories()
      .then((nextCategories) => {
        setCategoryItems(nextCategories);
        if (view !== "category" || !selectedCategoryId || generation !== pageRequestGeneration.current) return;
        if (!nextCategories.some((category) => category.id === selectedCategoryId)) {
          setSelectedCategoryId("");
          setView("recent");
          setPage(null);
          setPageLoading(false);
          void navigate({ to: "/" });
          return;
        }
        void listCategoryWorkspaces(selectedCategoryId, { limit: 50 })
          .then((result) => {
            if (generation === pageRequestGeneration.current) setPage(result);
          })
          .catch((err) => {
            if (generation === pageRequestGeneration.current) {
              showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh category workspaces." });
            }
          })
          .finally(() => {
            if (!silent && generation === pageRequestGeneration.current) setPageLoading(false);
          });
      })
      .catch((err) => {
        if (view === "category" && !silent && generation === pageRequestGeneration.current) setPageLoading(false);
        if (generation === null || generation === pageRequestGeneration.current) {
          showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh categories." });
        }
      });
  }, [navigate, selectedCategoryId, showToast, view]);

  useEffect(() => {
    if (handledLibraryRevision.current === libraryRevision) return;
    handledLibraryRevision.current = libraryRevision;
    refreshLibrary();
  }, [libraryRevision, refreshLibrary]);

  useEffect(() => {
    if (!recentlyCreatedWorkspaceId) return;
    const timeout = window.setTimeout(() => setRecentlyCreatedWorkspaceId(null), 600);
    return () => window.clearTimeout(timeout);
  }, [recentlyCreatedWorkspaceId]);

  const items = view === "recent" ? recentItems : (page?.items ?? []);
  const heading = view === "recent" ? "Recent workspaces" : view === "all" ? "All workspaces" : selectedCategory?.title ?? "Category";

  return {
    view,
    selectedCategoryId,
    categoryItems,
    page,
    pageLoading,
    creatingWorkspace,
    newWorkspaceTitle,
    createLoading,
    recentlyCreatedWorkspaceId,
    editingWorkspaceId,
    workspaceTitleDraft,
    savingWorkspaceId,
    deletingWorkspace,
    items,
    heading,
    setCreatingWorkspace,
    setNewWorkspaceTitle,
    setWorkspaceTitleDraft,
    setDeletingWorkspace,
    handleCreateWorkspace,
    beginWorkspaceRename,
    cancelWorkspaceRename,
    saveWorkspaceTitle,
    confirmDeleteWorkspace,
    selectCategory,
    openRecent,
    openAll,
    refreshLibrary,
  };
}

export type WorkspaceLibraryModel = ReturnType<typeof useWorkspaceLibrary>;
