import { useMemo, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { MoveRight, Pencil, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  Input,
  WorkspaceEntityIcon,
} from "../../../shared/ui";
import { ConfirmDialog } from "../../../shared/ui/overlays/confirm-dialog";
import type { WorkspaceSummary } from "../../../entities/workspace";
import { WorkspaceMoveDialog } from "../explorer/WorkspaceMoveDialog";
import { WorkspaceListSkeleton } from "./WorkspaceListSkeleton";
import type { WorkspaceLibraryModel } from "./use-workspace-library";

function editedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

type WorkspaceFolderCardProps = {
  workspace: WorkspaceSummary;
  subWorkspaces?: WorkspaceSummary[];
  entering?: boolean;
  editing?: boolean;
  editingTitle?: string;
  editLoading?: boolean;
  onEditingTitleChange?: (value: string) => void;
  onCommitTitle?: () => void;
  onCancelTitle?: () => void;
  onNewSubWorkspace?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
};

function WorkspaceFolderCard({
  workspace,
  subWorkspaces = [],
  entering = false,
  editing = false,
  editingTitle = "",
  editLoading = false,
  onEditingTitleChange,
  onCommitTitle,
  onCancelTitle,
  onNewSubWorkspace,
  onRename,
  onMove,
  onDelete,
}: WorkspaceFolderCardProps) {
  const metadata = [
    workspace.childCount > 0 ? `${workspace.childCount} sub-workspace${workspace.childCount === 1 ? "" : "s"}` : null,
    workspace.parentId ? "Sub-workspace" : null,
    workspace.hasCanvas ? "Canvas" : null,
  ].filter(Boolean).join(" · ") || "Workspace";

  const paperMotion = (delay: number) => ({
    initial: entering ? { opacity: 0, y: 5, scale: 0.96 } : false,
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: entering ? { duration: 0.16, delay, ease: "easeOut" as const } : undefined,
  });

  const cardLinkClass = "group block w-full min-h-20 rounded-[18px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const cardBody = (
    <article className="relative aspect-square overflow-hidden rounded-[18px] border border-line bg-tint transition-[transform,border-color,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:border-accent/50 group-hover:[box-shadow:var(--shadow-popup)]">
      <motion.span aria-hidden="true" className="absolute left-[58%] top-[24%] z-10 h-[35%] w-[27%]" {...paperMotion(0.04)}>
        <span className="block size-full rotate-[7deg] rounded-[8px] border border-line bg-surface p-1.5 transition-transform duration-200 group-hover:-translate-y-1">
          <span className="block h-1 w-[82%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[58%] rounded-full bg-line" />
          <span className="mt-4 block h-1 w-[70%] rounded-full bg-line" />
        </span>
      </motion.span>
      <motion.span aria-hidden="true" className="absolute left-[42%] top-[19%] z-10 h-[40%] w-[34%]" {...paperMotion(0.065)}>
        <span className="block size-full rotate-[2deg] rounded-[9px] border border-line bg-surface p-2 transition-transform duration-200 group-hover:-translate-y-1.5">
          <span className="block h-1 w-[84%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[62%] rounded-full bg-line" />
          <span className="mt-4 block h-1 w-[74%] rounded-full bg-line" />
        </span>
      </motion.span>
      <motion.span aria-hidden="true" className="absolute left-[24%] top-[13%] z-10 h-[47%] w-[48%]" {...paperMotion(0.09)}>
        <span className="block size-full -rotate-[9deg] rounded-[10px] border border-line bg-surface p-2.5 transition-transform duration-200 group-hover:-translate-y-2">
          <span className="block h-1 w-[86%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[64%] rounded-full bg-line" />
          <span className="mt-5 block h-1 w-[76%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[52%] rounded-full bg-line" />
        </span>
      </motion.span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-[61%] flex-col justify-end rounded-t-[18px] border-t border-line bg-surface/80 p-3.5 backdrop-blur-lg">
        {subWorkspaces.length > 0 && (
          <div className="pointer-events-auto relative z-30 mb-1.5 flex flex-wrap gap-1">
            {subWorkspaces.slice(0, 2).map((sub) => (
              <Link
                key={sub.id}
                to="/workspaces/$workspaceId"
                params={{ workspaceId: sub.id }}
                search={{ noteId: undefined }}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-line/80 bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-ink/85 hover:border-accent/50 hover:text-accent"
              >
                <WorkspaceEntityIcon size={10} className="text-muted" />
                <span className="truncate">{sub.title}</span>
              </Link>
            ))}
            {subWorkspaces.length > 2 && (
              <span className="inline-flex items-center px-1 text-[10px] font-medium text-muted">
                +{subWorkspaces.length - 2}
              </span>
            )}
          </div>
        )}
        <div className="pointer-events-auto relative z-30 flex items-end justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input
                autoFocus
                className="min-h-0 w-full rounded-md border-accent bg-surface px-2 py-1.5 text-[15px] font-semibold leading-tight tracking-[-.25px]"
                aria-label="Workspace title"
                value={editingTitle}
                disabled={editLoading}
                onChange={(event) => onEditingTitleChange?.(event.target.value)}
                onBlur={() => onCommitTitle?.()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); onCommitTitle?.(); }
                  if (event.key === "Escape") { event.preventDefault(); onCancelTitle?.(); }
                }}
              />
            ) : (
              <strong className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold leading-tight tracking-[-.25px] text-ink">{workspace.title}</strong>
            )}
            <span className="pointer-events-none mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-muted">{metadata}</span>
          </div>
          <time className="pointer-events-none shrink-0 rounded-full border border-line bg-background px-2 py-1 text-[11px] font-medium tabular-nums text-ink/70" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
        </div>
      </div>
      {!editing && (
        <Link
          to="/workspaces/$workspaceId"
          params={{ workspaceId: workspace.id }}
          search={{ noteId: undefined }}
          className="absolute inset-0 z-10 rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`Open ${workspace.title}`}
        />
      )}
    </article>
  );

  return (
    <motion.div
      layout="position"
      initial={entering ? { opacity: 0, y: 6, scale: 0.985 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={entering ? { duration: 0.18, ease: "easeOut" } : undefined}
      className="w-full max-w-[196px]"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={cardLinkClass}>{cardBody}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onNewSubWorkspace && (
            <ContextMenuItem onSelect={onNewSubWorkspace}><Plus size={13} /> New sub-workspace</ContextMenuItem>
          )}
          <ContextMenuItem onSelect={onRename}><Pencil size={13} /> Edit title</ContextMenuItem>
          <ContextMenuItem onSelect={onMove}><MoveRight size={13} /> Move to…</ContextMenuItem>
          <ContextMenuItem className="text-danger" onSelect={onDelete}><Trash2 size={13} /> Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </motion.div>
  );
}

type NewWorkspaceCardProps = {
  editing: boolean;
  value: string;
  loading: boolean;
  onActivate: () => void;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
};

function NewWorkspaceCard({ editing, value, loading, onActivate, onChange, onSubmit, onCancel }: NewWorkspaceCardProps) {
  return (
    <motion.div layout="position" className="relative aspect-square w-full max-w-[196px] min-h-20 rounded-[18px]">
      <AnimatePresence initial={false}>
        {!editing ? (
          <motion.button
            key="idle"
            type="button"
            onClick={onActivate}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            whileTap={{ scale: 0.97 }}
            className="group absolute inset-0 block w-full rounded-[18px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="New workspace"
          >
            <article className="relative flex size-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[18px] border border-dashed border-line bg-surface transition-[border-color,background-color] duration-200 group-hover:border-accent group-hover:bg-background">
              <span className="grid size-10 place-items-center rounded-full border border-line bg-background text-ink/70 transition-colors duration-200 group-hover:border-accent group-hover:text-accent">
                <Plus size={18} aria-hidden="true" />
              </span>
              <span className="text-[12px] font-medium text-ink/70 transition-colors duration-200 group-hover:text-accent">
                New workspace
              </span>
            </article>
          </motion.button>
        ) : (
          <motion.div
            key="editing"
            initial={{ opacity: 0, y: 4, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.985 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute inset-0 rounded-[18px]"
          >
            <article className="relative flex size-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[18px] border border-accent bg-background px-4">
              <form onSubmit={onSubmit} className="grid w-full gap-2">
                <Input
                  autoFocus
                  className="w-full min-h-0 py-1.5 px-2 text-[12px]"
                  placeholder="Workspace name"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
                  aria-label="New workspace name"
                  disabled={loading}
                />
                <div className="flex gap-1.5">
                  <Button
                    type="submit"
                    size="xs"
                    className="flex-1"
                    disabled={!value.trim() || loading}
                  >
                    {loading ? "Creating…" : "Create"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="px-2.5"
                    onClick={onCancel}
                    disabled={loading}
                  >
                    ✕
                  </Button>
                </div>
              </form>
            </article>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function WorkspaceEmptyIllustration() {
  return (
    <svg viewBox="0 0 280 184" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className="h-44 w-64 max-w-full shrink-0" aria-hidden="true" focusable="false">
      <path d="M44 82V64a8 8 0 0 1 8-8h48l16 16h108a8 8 0 0 1 8 8v65H44Z"
        fill="var(--surface)" stroke="var(--line)" />
      <rect x="76" y="32" width="88" height="112" rx="6" transform="rotate(-12 120 88)"
        fill="var(--surface)" stroke="var(--muted)" />
      <rect x="124" y="22" width="88" height="120" rx="6" transform="rotate(8 168 82)"
        fill="var(--surface)" stroke="var(--muted)" />
      <path d="m145 46 40 6m-43 10 40 6m-42 10 24 3" stroke="var(--line)" />
      <path d="M38 90a6 6 0 0 1 6-7h192a6 6 0 0 1 6 7l-12 61a8 8 0 0 1-8 7H58a8 8 0 0 1-8-7Z"
        fill="var(--surface)" stroke="var(--muted)" />
      <rect x="117" y="108" width="46" height="26" rx="4" stroke="var(--line)" />
      <path d="M130 118h20m-20 6h12" stroke="var(--line)" />
      <circle cx="224" cy="139" r="15" fill="var(--tint)" stroke="var(--accent)" />
      <path d="M218 139h12m-6-6v12" stroke="var(--accent)" />
    </svg>
  );
}

type WorkspaceLibraryProps = {
  model: WorkspaceLibraryModel;
  onOpenDataSettings?: () => void;
};

export function WorkspaceLibrary({ model, onOpenDataSettings }: WorkspaceLibraryProps) {
  const {
    view,
    page,
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
    fetchPage,
    retry,
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
  } = model;

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, WorkspaceSummary[]>();
    for (const ws of allWorkspaces) {
      if (!ws.parentId) continue;
      const list = map.get(ws.parentId);
      if (list) list.push(ws);
      else map.set(ws.parentId, [ws]);
    }
    return map;
  }, [allWorkspaces]);

  const creatingParentWorkspace = useMemo(
    () => (creatingParentId ? allWorkspaces.find((ws) => ws.id === creatingParentId) ?? items.find((ws) => ws.id === creatingParentId) : undefined),
    [allWorkspaces, creatingParentId, items],
  );

  return (
    <>
      <h1 id="library-list-title" className="sr-only">{heading}</h1>
      {!isLibraryEmpty && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-[21px] font-semibold tracking-tight text-ink">{heading}</h2>
            <p className="m-0 mt-0.5 text-xs text-muted">
              Visual map of root workspaces and their nested canvases.
            </p>
          </div>
        </div>
      )}

      <section className="min-w-0" aria-labelledby="library-list-title">
        {pageLoading ? <WorkspaceListSkeleton /> : loadError ? (
          <div role="alert" className="flex min-h-[130px] flex-col items-start justify-center gap-3 rounded-md border border-line bg-surface px-4 py-5">
            <p className="m-0 text-[12px] text-danger">Workspaces could not be loaded. {loadError}</p>
            <Button variant="secondary" size="sm" onClick={retry}>Retry</Button>
          </div>
        ) : items.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,196px))] gap-4 max-[560px]:grid-cols-[repeat(auto-fill,minmax(156px,180px))]" role="group" aria-label={view === "all" ? "All workspaces" : "Root workspaces"}>
            {items.map((workspace) => (
              <WorkspaceFolderCard
                key={workspace.id}
                workspace={workspace}
                subWorkspaces={childrenByParentId.get(workspace.id)}
                entering={workspace.id === recentlyCreatedWorkspaceId}
                editing={editingWorkspaceId === workspace.id}
                editingTitle={workspaceTitleDraft}
                editLoading={savingWorkspaceId === workspace.id}
                onEditingTitleChange={setWorkspaceTitleDraft}
                onCommitTitle={() => void saveWorkspaceTitle(workspace)}
                onCancelTitle={cancelWorkspaceRename}
                onNewSubWorkspace={() => {
                  setCreatingParentId(workspace.id);
                  setCreatingWorkspace(true);
                  setNewWorkspaceTitle("");
                }}
                onRename={() => beginWorkspaceRename(workspace)}
                onMove={() => setMovingWorkspace(workspace)}
                onDelete={() => requestDeleteWorkspace(workspace)}
              />
            ))}
            <NewWorkspaceCard
              editing={creatingWorkspace && !creatingParentId}
              value={newWorkspaceTitle}
              loading={createLoading}
              onActivate={() => { setCreatingParentId(null); setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}
              onChange={setNewWorkspaceTitle}
              onSubmit={(event) => { void handleCreateWorkspace(event); }}
              onCancel={() => { setCreatingWorkspace(false); setNewWorkspaceTitle(""); }}
            />
          </div>
        ) : (
          <section className="mx-auto flex min-h-[calc(100dvh-160px)] max-w-lg flex-col items-center justify-center gap-6 py-8 text-center" aria-label="Welcome to Notespace">
            <WorkspaceEmptyIllustration />
            <div className="flex w-full flex-col items-center gap-3">
              <h2 className="m-0 text-[21px] font-semibold tracking-tight text-ink">No workspaces yet</h2>
              <p className="m-0 max-w-sm text-[13px] leading-6 text-muted">
                Bring sketches, diagrams and code together on one Canvas. Create a Workspace to get started.
              </p>
              {!creatingWorkspace ? (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <Button type="button" onClick={() => { setCreatingParentId(null); setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}>
                    <Plus size={15} aria-hidden="true" /> Create Workspace
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => onOpenDataSettings?.()}>
                    Restore backup
                  </Button>
                </div>
              ) : (
                <form className="mt-2 grid w-full max-w-sm gap-2" onSubmit={(event) => { void handleCreateWorkspace(event); }}>
                  <Input
                    autoFocus
                    aria-label="Workspace name"
                    placeholder="Workspace name"
                    value={newWorkspaceTitle}
                    onChange={(event) => setNewWorkspaceTitle(event.target.value)}
                    disabled={createLoading}
                  />
                  <div className="flex items-center justify-center gap-2">
                    <Button size="sm" type="submit" disabled={!newWorkspaceTitle.trim() || createLoading}>
                      {createLoading ? "Creating…" : "Create"}
                    </Button>
                    <Button size="sm" type="button" variant="secondary" onClick={() => setCreatingWorkspace(false)} disabled={createLoading}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </section>
        )}
      </section>

      {page && page.total > page.limit && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-[11px] text-ink/70" aria-label="Workspace pages">
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[30px] px-2.5 py-1.5 text-[11px]"
            disabled={!page.offset || pageLoading}
            onClick={() => void fetchPage(view, Math.max(0, page.offset - page.limit), true)}
          >
            Previous
          </Button>
          <span>{page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total}</span>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[30px] px-2.5 py-1.5 text-[11px]"
            disabled={page.nextOffset === undefined || pageLoading}
            onClick={() => void fetchPage(view, page.nextOffset ?? page.offset, true)}
          >
            Next
          </Button>
        </nav>
      )}

      <Dialog
        open={creatingWorkspace && Boolean(creatingParentId)}
        onOpenChange={(open) => {
          if (!open && !createLoading) {
            setCreatingWorkspace(false);
            setCreatingParentId(null);
            setNewWorkspaceTitle("");
          }
        }}
      >
        <DialogContent size="sm" padded={false}>
          <DialogDescription className="sr-only">
            Create a nested sub-workspace inside the selected workspace.
          </DialogDescription>
          <DialogHeader
            title="New sub-workspace"
            subtitle={creatingParentWorkspace ? `Inside “${creatingParentWorkspace.title}”` : undefined}
            closeLabel="Cancel new sub-workspace"
            onClose={() => {
              if (!createLoading) {
                setCreatingWorkspace(false);
                setCreatingParentId(null);
                setNewWorkspaceTitle("");
              }
            }}
          />
          <form onSubmit={(event) => { void handleCreateWorkspace(event); }} className="grid gap-3 p-4">
            <Input
              autoFocus
              aria-label="Sub-workspace name"
              placeholder="Sub-workspace name"
              value={newWorkspaceTitle}
              onChange={(event) => setNewWorkspaceTitle(event.target.value)}
              disabled={createLoading}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={createLoading}
                onClick={() => {
                  setCreatingWorkspace(false);
                  setCreatingParentId(null);
                  setNewWorkspaceTitle("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!newWorkspaceTitle.trim() || createLoading}>
                {createLoading ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <WorkspaceMoveDialog
        workspace={movingWorkspace}
        onOpenChange={(open) => { if (!open) setMovingWorkspace(null); }}
        onSelectParent={async (targetParentId) => {
          if (movingWorkspace) await moveWorkspaceToParent(movingWorkspace, targetParentId);
        }}
      />

      <ConfirmDialog
        open={!!deletingWorkspace}
        title="Delete this workspace?"
        description={deletingWorkspace ? `“${deletingWorkspace.title}” will be moved to Trash.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeletingWorkspace(null); }}
        onConfirm={() => void confirmDeleteWorkspace()}
      />

      <ConfirmDialog
        open={!!blockedDeleteParent}
        title="Move sub-workspaces first"
        description={blockedDeleteParent
          ? `“${blockedDeleteParent.title}” has ${blockedDeleteParent.childCount} sub-workspace${blockedDeleteParent.childCount === 1 ? "" : "s"}. Move them before deleting this workspace.`
          : ""}
        confirmLabel={blockedDeleteParent?.parentId ? "Move sub-workspaces to parent" : "Move sub-workspaces to top level"}
        onOpenChange={(open) => { if (!open) setBlockedDeleteParent(null); }}
        onConfirm={() => { if (blockedDeleteParent) void reparentChildrenToParent(blockedDeleteParent); }}
      />
    </>
  );
}
