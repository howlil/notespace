import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { contextKeyForParent, useLibraryExplorer } from "./library-explorer-provider";
import {
  APIError,
  createWorkspace,
  deleteWorkspace,
  moveWorkspaceParent,
  renameWorkspace,
  reparentWorkspaceChildren,
} from "../../../platform/api/workspace-api";
import { notifyLibraryChanged } from "../../../platform/api/library-invalidation";
import type { Workspace, WorkspaceSummary } from "../../../entities/workspace";
import { workspaceRenameTitle } from "../model/naming";
import { errorMessage } from "../../../shared/lib/error-message";
import { useToast } from "../../../shared/ui/feedback/toast-provider";

type CreateTarget = { parentId: string | null };
export type LibraryChange = { kind: "workspace-deleted"; workspaceId: string };

type Options = {
  activeWorkspace?: Workspace;
  onChanged?: (change?: LibraryChange) => void;
  onBeforeDeleteWorkspace?: (workspaceId: string) => Promise<boolean | number>;
};

export function useLibraryNavigation({ activeWorkspace, onChanged, onBeforeDeleteWorkspace }: Options) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { childrenPages, loadingKeys, errorKeys, loadChildren } = useLibraryExplorer();

  const contextParentId = activeWorkspace?.id ?? null;
  const contextKey = contextKeyForParent(contextParentId);

  useEffect(() => {
    void loadChildren(contextParentId);
  }, [contextParentId, loadChildren]);

  const items = useMemo(() => childrenPages[contextKey]?.items ?? [], [childrenPages, contextKey]);
  const hasMore = childrenPages[contextKey]?.nextOffset !== undefined;
  const isLoading = loadingKeys.has(contextKey);
  const hasError = errorKeys.has(contextKey);

  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateTarget | null>(null);
  const pendingWorkspaceCreate = useRef<{ id: string; title: string; parentId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceSummary | null>(null);
  const [blockedDeleteParent, setBlockedDeleteParent] = useState<WorkspaceSummary | null>(null);
  const [movingWorkspace, setMovingWorkspace] = useState<WorkspaceSummary | null>(null);
  const [title, setTitle] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const createSubmitting = useRef(false);
  const pendingRenames = useRef(new Set<string>());
  const [savingWorkspaceId, setSavingWorkspaceId] = useState<string | null>(null);

  function signalLibraryChanged(change?: LibraryChange) {
    notifyLibraryChanged();
    onChanged?.(change);
  }

  function startCreate(parentId: string | null) {
    if (createSubmitting.current) return;
    setTitle("");
    setCreating({ parentId });
  }

  async function submitCreate() {
    const next = title.trim();
    if (!creating || !next || createSubmitting.current) return;
    createSubmitting.current = true;
    setCreateLoading(true);

    try {
      const targetParent = creating.parentId;
      const pending = pendingWorkspaceCreate.current;
      const draft = pending?.title === next && pending.parentId === targetParent
        ? pending
        : { id: crypto.randomUUID(), title: next, parentId: targetParent };
      pendingWorkspaceCreate.current = draft;
      const created = await createWorkspace(next, targetParent, draft.id);
      pendingWorkspaceCreate.current = null;

      setTitle("");
      setCreating(null);
      await navigate({
        to: "/workspaces/$workspaceId",
        params: { workspaceId: created.id },
        search: { noteId: undefined },
      });
      notifyLibraryChanged();
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not create this workspace." });
    } finally {
      createSubmitting.current = false;
      setCreateLoading(false);
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

  function requestDelete(workspace: WorkspaceSummary) {
    if (workspace.childCount > 0) {
      setBlockedDeleteParent(workspace);
      return;
    }
    setDeleting(workspace);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    try {
      const prepared = onBeforeDeleteWorkspace ? await onBeforeDeleteWorkspace(target.id) : true;
      if (!prepared) return;
      const expectedVersion = typeof prepared === "number"
        ? Math.max(target.version, prepared)
        : target.version;
      await deleteWorkspace(target.id, expectedVersion);
      setDeleting(null);
      signalLibraryChanged({ kind: "workspace-deleted", workspaceId: target.id });
    } catch (error) {
      if (error instanceof APIError && error.code === "workspace_has_children") {
        setDeleting(null);
        setBlockedDeleteParent(target);
        return;
      }
      setDeleting(target);
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not delete workspace.",
      });
    }
  }

  async function reparentChildrenToParent(parent: WorkspaceSummary) {
    try {
      const targetParentId = parent.parentId ?? null;
      await reparentWorkspaceChildren(parent.id, targetParentId);
      setBlockedDeleteParent(null);
      signalLibraryChanged();
      showToast({
        kind: "success",
        message: targetParentId ? "Sub-workspaces moved to parent." : "Sub-workspaces moved to top level.",
      });
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not move sub-workspaces.",
      });
    }
  }

  async function moveWorkspaceToParent(workspace: WorkspaceSummary, targetParentId: string | null) {
    if (workspace.parentId === targetParentId) return;
    try {
      await moveWorkspaceParent(workspace.id, targetParentId, workspace.parentId ?? null);
      signalLibraryChanged();
      showToast({ kind: "success", message: "Workspace moved." });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not move workspace." });
    }
  }

  return {
    contextKey,
    contextParentId,
    items,
    hasMore,
    isLoading,
    hasError,
    creating,
    createLoading,
    deleting,
    blockedDeleteParent,
    movingWorkspace,
    editingWorkspace,
    savingWorkspaceId,
    title,
    confirmDelete,
    moveWorkspaceToParent,
    reparentChildrenToParent,
    requestDelete,
    saveWorkspace,
    setBlockedDeleteParent,
    setCreating,
    setDeleting,
    setEditingWorkspace,
    setMovingWorkspace,
    setTitle,
    startCreate,
    submitCreate,
    retryContext: () => loadChildren(contextParentId, true),
  };
}
