import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { UNCATEGORIZED_CATEGORY_ID, type CategorySummary, type WorkspaceSummary, type WorkspacePage } from "../../domain/workspace/workspace";
import { createWorkspace, deleteWorkspace, listAllWorkspaces, listCategories, listCategoryWorkspaces, renameWorkspace, APIError } from "../../adapters/http/workspace-api";
import { notifyLibraryChanged } from "../../adapters/browser/library-change";
import { useLibraryRevision } from "./use-library-revision";
import { workspaceRenameTitle } from "../../domain/workspace/naming";
import { errorMessage } from "../../shared/lib/error-message";
import { useToast } from "../../shared/ui/toast-provider";

export type LibraryView = "all" | "category";
export type CategoryWorkspaceFilters = { query: string; sort: "" | "created" | "name" | "notes"; hasCanvas: boolean; hasNotes: boolean; offset: number };
const defaultCategoryFilters: CategoryWorkspaceFilters = { query: "", sort: "", hasCanvas: false, hasNotes: false, offset: 0 };

export type UseWorkspaceLibraryOptions = {
  categories: CategorySummary[];
  initialSelectedCategoryId?: string;
  initialCategoryPage?: WorkspacePage;
};

export function useWorkspaceLibrary({ categories, initialSelectedCategoryId, initialCategoryPage }: UseWorkspaceLibraryOptions) {
  const navigate = useNavigate();
  const routeCategory = useRouterState({ select: (state) => typeof state.location.search.category === "string" ? state.location.search.category : "" });
  const previousRouteCategory = useRef(routeCategory);
  const { showToast } = useToast();
  const libraryRevision = useLibraryRevision();
  const handledLibraryRevision = useRef(libraryRevision);
  const pageRequestGeneration = useRef(0);
  const categorySnapshotRef = useRef<{ key: string; token: string } | null>(
    initialSelectedCategoryId && initialCategoryPage?.snapshot
      ? { key: JSON.stringify({ category: initialSelectedCategoryId, query: "", sort: "", hasCanvas: false, hasNotes: false }), token: initialCategoryPage.snapshot }
      : null,
  );
  const allSnapshotRef = useRef<string | null>(null);
  const useInitialCategoryPage = useRef(Boolean(initialSelectedCategoryId && initialCategoryPage));
  const [view, setView] = useState<LibraryView>(initialSelectedCategoryId ? "category" : "all");
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialSelectedCategoryId ?? "");
  const [categoryItems, setCategoryItems] = useState(categories);
  const [page, setPage] = useState<WorkspacePage | null>(initialCategoryPage ?? null);
  const [pageLoading, setPageLoading] = useState(!initialSelectedCategoryId);
  const [allLoadError, setAllLoadError] = useState<string | null>(null);
  const [categoryLoadError, setCategoryLoadError] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<CategoryWorkspaceFilters>(defaultCategoryFilters);
  const selectedCategory = useMemo(() => categoryItems.find((category) => category.id === selectedCategoryId), [categoryItems, selectedCategoryId]);

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const pendingWorkspaceCreate = useRef<{ id: string; title: string; categoryId?: string } | null>(null);
  const [recentlyCreatedWorkspaceId, setRecentlyCreatedWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState("");
  const [savingWorkspaceId, setSavingWorkspaceId] = useState<string | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceSummary | null>(null);
  const workspaceRenameSubmitting = useRef(false);
  const workspaceRenameCancelled = useRef(false);

  const newWorkspaceCategoryId = useMemo(() => {
    if (view === "category" && selectedCategoryId) return selectedCategoryId;
    return (categoryItems.find((c) => c.id === UNCATEGORIZED_CATEGORY_ID) ?? categoryItems.find((c) => c.title.toLowerCase() === "uncategorized"))?.id;
  }, [view, selectedCategoryId, categoryItems]);

  async function handleCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    const title = newWorkspaceTitle.trim();
    if (!title) return;
    setCreateLoading(true);
    try {
      const pending = pendingWorkspaceCreate.current;
      const draft = pending?.title === title && pending.categoryId === newWorkspaceCategoryId
        ? pending : { id: crypto.randomUUID(), title, categoryId: newWorkspaceCategoryId };
      pendingWorkspaceCreate.current = draft;
      const workspace = await createWorkspace(title, newWorkspaceCategoryId, draft.id);
      pendingWorkspaceCreate.current = null;
      setRecentlyCreatedWorkspaceId(workspace.id);

      setPage((current) => current ? {
        ...current,
        items: [workspace, ...current.items.filter((item) => item.id !== workspace.id)].slice(0, current.limit),
        total: current.items.some((item) => item.id === workspace.id) ? current.total : current.total + 1,
      } : current);

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
      const renamed = await renameWorkspace(workspace.id, value, workspace.title);
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

  function selectCategory(id: string, force = false) {
    if (id === selectedCategoryId && !force) return;
    if (id === selectedCategoryId && force) {
      setCategoryFilters((current) => ({ ...current }));
      return;
    }
    // URL is the single owner of category selection; the route effect loads one page.
    void navigate({ to: "/", search: { category: id } });
  }

  // Default Home to the paginated complete Workspace collection, not Recent.
  useEffect(() => {
    if (initialSelectedCategoryId) return;
    const generation = ++pageRequestGeneration.current;
    setAllLoadError(null);
    setPageLoading(true);
    void listAllWorkspaces({ limit: 50, snapshot: "start" })
      .then((result) => {
        if (generation !== pageRequestGeneration.current) return;
        allSnapshotRef.current = result.snapshot ?? null;
        setPage(result);
      })
      .catch((error) => {
        if (generation === pageRequestGeneration.current) {
          setAllLoadError(error instanceof Error ? error.message : "Could not load workspaces.");
        }
      })
      .finally(() => { if (generation === pageRequestGeneration.current) setPageLoading(false); });
  }, [initialSelectedCategoryId]);

  // Browser Back/Forward selection is URL-owned; disclosure remains sidebar-owned.
  useEffect(() => {
    if (previousRouteCategory.current === routeCategory) return;
    previousRouteCategory.current = routeCategory;
    const nextCategory = categoryItems.some((item) => item.id === routeCategory) ? routeCategory : "";
    pageRequestGeneration.current += 1;
    categorySnapshotRef.current = null;
    setSelectedCategoryId(nextCategory);
    setView(nextCategory ? "category" : "all");
    setPage(null);
    setCategoryLoadError(null);
    setAllLoadError(null);
    setCategoryFilters({ ...defaultCategoryFilters });
    // URL category changes must clear the displayed search as well as its server filter.
    setCategorySearch("");
    if (nextCategory) {
      setPageLoading(true);
    } else {
      const generation = ++pageRequestGeneration.current;
      setPageLoading(true);
      void listAllWorkspaces({ limit: 50, snapshot: "start" })
        .then((result) => {
          if (generation !== pageRequestGeneration.current) return;
          allSnapshotRef.current = result.snapshot ?? null;
          setPage(result);
        })
        .catch((error) => {
          if (generation === pageRequestGeneration.current) setAllLoadError(error instanceof Error ? error.message : "Could not load workspaces.");
        })
        .finally(() => { if (generation === pageRequestGeneration.current) setPageLoading(false); });
    }
  }, [categoryItems, routeCategory]);

  function updateCategoryFilters(patch: Partial<CategoryWorkspaceFilters>) {
    if (patch.offset === undefined) categorySnapshotRef.current = null;
    setPageLoading(true);
    setCategoryFilters((current) => ({ ...current, ...patch, offset: patch.offset ?? 0 }));
  }

  // Filters and pagination are applied by the server against the complete category,
  // not just the first loaded 50 items.
  useEffect(() => {
    if (view !== "category" || !selectedCategoryId) return;
    if (useInitialCategoryPage.current) {
      useInitialCategoryPage.current = false;
      return; // The route loader already returned the unfiltered first page.
    }
    const generation = ++pageRequestGeneration.current;
    setPageLoading(true);
    setPage(null);
    setCategoryLoadError(null);
    const key = JSON.stringify({ category: selectedCategoryId, query: categoryFilters.query, sort: categoryFilters.sort, hasCanvas: categoryFilters.hasCanvas, hasNotes: categoryFilters.hasNotes });
    const session = categorySnapshotRef.current;
    if (categoryFilters.offset > 0 && (!session || session.key !== key)) {
      setCategoryFilters((current) => ({ ...current, offset: 0 }));
      return;
    }
    const snapshot = session?.key === key ? session.token : "start";
    void listCategoryWorkspaces(selectedCategoryId, { ...categoryFilters, limit: 50, snapshot })
      .then((result) => {
        if (pageRequestGeneration.current === generation) {
          if (result.snapshot) categorySnapshotRef.current = { key, token: result.snapshot };
          setPage(result);
        }
      })
      .catch((err) => {
        if (pageRequestGeneration.current === generation) {
          if (err instanceof APIError && err.status === 409 && snapshot !== "start") {
            categorySnapshotRef.current = null;
            setCategoryFilters((current) => ({ ...current, offset: 0 }));
            return;
          }
          const message = err instanceof Error ? err.message : "Could not load category workspaces.";
          setCategoryLoadError(message);
          showToast({ kind: "error", message });
        }
      })
      .finally(() => {
        if (pageRequestGeneration.current === generation) setPageLoading(false);
      });
  }, [selectedCategoryId, view, categoryFilters, showToast]);

  useEffect(() => {
    if (view !== "category") return;
    const timeout = window.setTimeout(() => {
      const query = categorySearch.trim();
      setCategoryFilters((current) => current.query === query ? current : { ...current, query, offset: 0 });
    }, 240);
    return () => window.clearTimeout(timeout);
  }, [categorySearch, view]);

  async function openAll(offset = 0, preserveSnapshot = false) {
    const generation = ++pageRequestGeneration.current;
    const snapshot = preserveSnapshot && allSnapshotRef.current ? allSnapshotRef.current : "start";
    const requestedOffset = offset > 0 && snapshot !== "start" ? offset : 0;
    setView("all");
    setSelectedCategoryId("");
    setAllLoadError(null);
    setPageLoading(true);
    void navigate({ to: "/", search: {}, replace: true });
    try {
      const result = await listAllWorkspaces({ offset: requestedOffset, limit: 50, snapshot });
      if (pageRequestGeneration.current === generation) {
        allSnapshotRef.current = result.snapshot ?? null;
        setPage(result);
      }
    } catch (err) {
      if (pageRequestGeneration.current === generation) {
        if (err instanceof APIError && err.status === 409 && snapshot !== "start") {
          allSnapshotRef.current = null;
          void openAll(0);
          return;
        }
        setAllLoadError(err instanceof Error ? err.message : "Could not load workspaces.");
      }
    } finally {
      if (pageRequestGeneration.current === generation) setPageLoading(false);
    }
  }

  const refreshLibrary = useCallback((options: { silent?: boolean } = {}) => {
    const silent = options.silent ?? false;
    const generation = ++pageRequestGeneration.current;

    if (view === "all") {
      setAllLoadError(null);
      if (!silent) setPageLoading(true);
      void listAllWorkspaces({ limit: 50, snapshot: "start" })
        .then((result) => {
          if (generation === pageRequestGeneration.current) {
            allSnapshotRef.current = result.snapshot ?? null;
            setPage(result);
          }
        })
        .catch((err) => {
          if (generation === pageRequestGeneration.current) {
            setAllLoadError(err instanceof Error ? err.message : "Could not refresh workspaces.");
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
          setView("all");
          setPage(null);
          setPageLoading(false);
          void navigate({ to: "/" });
          return;
        }
        void listCategoryWorkspaces(selectedCategoryId, { ...categoryFilters, offset: 0, limit: 50, snapshot: "start" })
          .then((result) => {
            if (generation === pageRequestGeneration.current) {
              categorySnapshotRef.current = { key: JSON.stringify({ category: selectedCategoryId, query: categoryFilters.query, sort: categoryFilters.sort, hasCanvas: categoryFilters.hasCanvas, hasNotes: categoryFilters.hasNotes }), token: result.snapshot ?? "" };
              setPage(result);
              if (categoryFilters.offset !== 0) setCategoryFilters((current) => ({ ...current, offset: 0 }));
            }
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
  }, [categoryFilters, navigate, selectedCategoryId, showToast, view]);

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

  const items = page?.items ?? [];
  const heading = view === "all" ? "All workspaces" : selectedCategory?.title ?? "Category";

  return {
    view,
    selectedCategoryId,
    categoryItems,
    page,
    pageLoading,
    categoryLoadError,
    allLoadError,
    retryAll: () => { void openAll(0); },
    retryCategory: () => setCategoryFilters((current) => ({ ...current })),
    categorySearch,
    setCategorySearch,
    categoryFilters,
    updateCategoryFilters,
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
    openAll,
    refreshLibrary,
  };
}

export type WorkspaceLibraryModel = ReturnType<typeof useWorkspaceLibrary>;
