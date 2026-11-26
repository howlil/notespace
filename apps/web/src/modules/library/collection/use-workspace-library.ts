import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { WorkspacePage, WorkspaceSummary } from "../../../entities/workspace";
import {
  APIError,
  createWorkspace,
  deleteWorkspace,
  listAllWorkspaces,
  listRecentWorkspaces,
  listRootWorkspaces,
  moveWorkspaceParent,
  renameWorkspace,
  reparentWorkspaceChildren,
} from "../../../platform/api/workspace-api";
import { notifyLibraryChanged } from "../../../platform/api/library-invalidation";
import { useLibraryRevision } from "../use-library-revision";
import { workspaceRenameTitle } from "../model/naming";
import { errorMessage } from "../../../shared/lib/error-message";
import { useToast } from "../../../shared/ui/feedback/toast-provider";

export type LibraryView = "roots" | "all";

type UseWorkspaceLibraryOptions = {
  initialView: LibraryView;
  initialPage: WorkspacePage;
  initialError?: string | null;
  recentWorkspaces: WorkspaceSummary[];
  initialAllWorkspaces?: WorkspaceSummary[];
};

export function useWorkspaceLibrary({
  initialView,
  initialPage,
  initialError = null,
  recentWorkspaces: initialRecent,
  initialAllWorkspaces = [],
}: UseWorkspaceLibraryOptions) {
  const navigate = useNavigate();
  const routeView = useRouterState({
    select: (state) => (state.location.search as { view?: string }).view === "all" ? "all" : "roots",
  });
  const previousRouteView = useRef<LibraryView>(routeView);
  const { showToast } = useToast();
  const libraryRevision = useLibraryRevision();
  const handledLibraryRevision = useRef(libraryRevision);
  const pageRequestGeneration = useRef(0);
  const snapshotRef = useRef<{ view: LibraryView; token: string } | null>(
    initialPage.snapshot ? { view: initialView, token: initialPage.snapshot } : null,
  );

  const [view, setView] = useState<LibraryView>(initialView);
  const [page, setPage] = useState<WorkspacePage | null>(initialError ? null : initialPage);
  const [recentWorkspaces, setRecentWorkspaces] = useState<WorkspaceSummary[]>(initialRecent);
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceSummary[]>(initialAllWorkspaces);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null);
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const createSubmitting = useRef(false);
  const pendingWorkspaceCreate = useRef<{ id: string; title: string; parentId: string | null } | null>(null);
  const [recentlyCreatedWorkspaceId, setRecentlyCreatedWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState("");
  const [savingWorkspaceId, setSavingWorkspaceId] = useState<string | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceSummary | null>(null);
  const [blockedDeleteParent, setBlockedDeleteParent] = useState<WorkspaceSummary | null>(null);
  const [movingWorkspace, setMovingWorkspace] = useState<WorkspaceSummary | null>(null);
  const workspaceRenameSubmitting = useRef(false);
  const workspaceRenameCancelled = useRef(false);

  const fetchPage = useCallback(async (targetView: LibraryView, offset = 0, preserveSnapshot = false) => {
    const generation = ++pageRequestGeneration.current;
    const activeSnapshot = preserveSnapshot && snapshotRef.current?.view === targetView
      ? snapshotRef.current.token
      : "start";
    const requestedOffset = offset > 0 && activeSnapshot !== "start" ? offset : 0;

    setLoadError(null);
    setPageLoading(true);
    try {
      const result = targetView === "all"
        ? await listAllWorkspaces({ offset: requestedOffset, limit: 50, snapshot: activeSnapshot })
        : await listRootWorkspaces({ offset: requestedOffset, limit: 50, snapshot: activeSnapshot });
      if (pageRequestGeneration.current !== generation) return;
      snapshotRef.current = result.snapshot ? { view: targetView, token: result.snapshot } : null;
      setPage(result);
    } catch (err) {
      if (pageRequestGeneration.current !== generation) return;
      if (err instanceof APIError && err.status === 409 && activeSnapshot !== "start") {
        snapshotRef.current = null;
        void fetchPage(targetView, 0, false);
        return;
      }
      setLoadError(err instanceof Error ? err.message : "Could not load workspaces.");
    } finally {
      if (pageRequestGeneration.current === generation) {
        setPageLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (previousRouteView.current === routeView) return;
    previousRouteView.current = routeView;
    setView(routeView);
    snapshotRef.current = null;
    void fetchPage(routeView, 0, false);
  }, [fetchPage, routeView]);

  const refreshLibrary = useCallback((options: { silent?: boolean } = {}) => {
    const silent = options.silent ?? false;
    const generation = ++pageRequestGeneration.current;
    setLoadError(null);
    if (!silent) setPageLoading(true);
    const loader = view === "all"
      ? listAllWorkspaces({ limit: 50, snapshot: "start" })
      : listRootWorkspaces({ limit: 50, snapshot: "start" });
    void Promise.all([loader, listRecentWorkspaces(4), listAllWorkspaces({ limit: 100, snapshot: "start" })])
      .then(([nextPage, nextRecent, nextAll]) => {
        if (pageRequestGeneration.current !== generation) return;
        snapshotRef.current = nextPage.snapshot ? { view, token: nextPage.snapshot } : null;
        setPage(nextPage);
        setRecentWorkspaces(nextRecent);
        setAllWorkspaces(nextAll.items);
      })
      .catch((err) => {
        if (pageRequestGeneration.current !== generation) return;
        setLoadError(err instanceof Error ? err.message : "Could not refresh workspaces.");
      })
      .finally(() => {
        if (!silent && pageRequestGeneration.current === generation) {
          setPageLoading(false);
        }
      });
  }, [view]);

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

  function switchView(nextView: LibraryView) {
    if (nextView === view) return;
    void navigate({
      to: "/map",
      search: nextView === "all" ? { view: "all" } : {},
    });
  }

  async function handleCreateWorkspace(event: FormEvent) {
    event.preventDefault();
    const title = newWorkspaceTitle.trim();
    if (!title || createSubmitting.current) return;
    createSubmitting.current = true;
    setCreateLoading(true);
    try {
      const pending = pendingWorkspaceCreate.current;
      const draft = pending?.title === title && pending.parentId === creatingParentId
        ? pending
        : { id: crypto.randomUUID(), title, parentId: creatingParentId };
      pendingWorkspaceCreate.current = draft;
      const workspace = await createWorkspace(title, creatingParentId, draft.id);
      pendingWorkspaceCreate.current = null;
      setRecentlyCreatedWorkspaceId(workspace.id);

      setNewWorkspaceTitle("");
      setCreatingWorkspace(false);
      setCreatingParentId(null);
      await navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: workspace.id }, search: { noteId: undefined } });
      notifyLibraryChanged();
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not create workspace." });
    } finally {
      createSubmitting.current = false;
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
    setRecentWorkspaces((current) => current.map(replace));
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

  function requestDeleteWorkspace(workspace: WorkspaceSummary) {
    if (workspace.childCount > 0) {
      setBlockedDeleteParent(workspace);
      return;
    }
    setDeletingWorkspace(workspace);
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
      setRecentWorkspaces((current) => current.filter((w) => w.id !== target.id));
      if (editingWorkspaceId === target.id) cancelWorkspaceRename();
      notifyLibraryChanged();
      showToast({ kind: "success", message: "Workspace deleted." });
    } catch (err) {
      if (err instanceof APIError && err.code === "workspace_has_children") {
        setBlockedDeleteParent(target);
        return;
      }
      showToast({ kind: "error", message: errorMessage(err, "Could not delete workspace.") });
    }
  }

  async function reparentChildrenToParent(parent: WorkspaceSummary) {
    try {
      await reparentWorkspaceChildren(parent.id, parent.parentId ?? null);
      setBlockedDeleteParent(null);
      notifyLibraryChanged();
      showToast({
        kind: "success",
        message: parent.parentId ? "Sub-workspaces moved to parent." : "Sub-workspaces moved to top level.",
      });
    } catch (err) {
      showToast({ kind: "error", message: errorMessage(err, "Could not move sub-workspaces.") });
    }
  }

  async function moveWorkspaceToParent(workspace: WorkspaceSummary, targetParentId: string | null) {
    if (workspace.parentId === targetParentId) return;
    try {
      await moveWorkspaceParent(workspace.id, targetParentId, workspace.parentId ?? null);
      notifyLibraryChanged();
      showToast({ kind: "success", message: "Workspace moved." });
    } catch (err) {
      showToast({ kind: "error", message: errorMessage(err, "Could not move workspace.") });
    }
  }

  const items = page?.items ?? [];
  const heading = "Workspace Map";
  const isLibraryEmpty = !pageLoading && !loadError && page?.total === 0 && recentWorkspaces.length === 0;

  return {
    view,
    page,
    recentWorkspaces,
    allWorkspaces,
    pageLoading,
    loadError,
    isLibraryEmpty,
    creatingWorkspace,
    creatingParentId,
    newWorkspaceTitle,
    createLoading,
    recentlyCreatedWorkspaceId,
    editingWorkspaceId,
    workspaceTitleDraft,
    savingWorkspaceId,
    deletingWorkspace,
    blockedDeleteParent,
    movingWorkspace,
    items,
    heading,
    switchView,
    fetchPage,
    retry: () => void fetchPage(view, 0, false),
    setCreatingWorkspace,
    setCreatingParentId,
    setNewWorkspaceTitle,
    setWorkspaceTitleDraft,
    setDeletingWorkspace,
    setBlockedDeleteParent,
    setMovingWorkspace,
    handleCreateWorkspace,
    beginWorkspaceRename,
    cancelWorkspaceRename,
    saveWorkspaceTitle,
    requestDeleteWorkspace,
    confirmDeleteWorkspace,
    reparentChildrenToParent,
    moveWorkspaceToParent,
    refreshLibrary,
  };
}

export type WorkspaceLibraryModel = ReturnType<typeof useWorkspaceLibrary>;
