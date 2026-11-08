import { Link } from "@tanstack/react-router";
import { Folder, Pencil, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Input } from "../../../shared/ui";
import { ConfirmDialog } from "../../../shared/ui/overlays/confirm-dialog";
import type { WorkspaceSummary } from "../../../domain/workspace/workspace";
import { WorkspaceListSkeleton } from "./WorkspaceListSkeleton";
import type { WorkspaceLibraryModel } from "./use-workspace-library";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type WorkspaceFolderCardProps = {
  workspace: WorkspaceSummary;
  categoryTitle?: string;
  entering?: boolean;
  editing?: boolean;
  editingTitle?: string;
  editLoading?: boolean;
  onEditingTitleChange?: (value: string) => void;
  onCommitTitle?: () => void;
  onCancelTitle?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
};

function WorkspaceFolderCard({
  workspace,
  categoryTitle,
  entering = false,
  editing = false,
  editingTitle = "",
  editLoading = false,
  onEditingTitleChange,
  onCommitTitle,
  onCancelTitle,
  onRename,
  onDelete,
}: WorkspaceFolderCardProps) {
  const metadata = [
    categoryTitle,
    workspace.hasCanvas ? "Canvas" : null,
  ].filter(Boolean).join(" · ");

  const paperMotion = (delay: number) => ({
    initial: entering ? { opacity: 0, y: 5, scale: 0.96 } : false,
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: entering ? { duration: 0.16, delay, ease: "easeOut" as const } : undefined,
  });

  const cardLinkClass = "group block w-full min-h-20 rounded-[18px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const cardBody = (
    <article className="relative aspect-square overflow-hidden rounded-[18px] border border-accent/40 bg-accent transition-[transform,border-color,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:border-accent group-hover:shadow-md">
      <motion.span aria-hidden="true" className="absolute left-[58%] top-[24%] z-10 h-[35%] w-[27%]" {...paperMotion(0.04)}>
        <span className="block size-full rotate-[7deg] rounded-[8px] border border-line bg-background p-1.5 transition-transform duration-200 group-hover:-translate-y-1">
          <span className="block h-1 w-[82%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[58%] rounded-full bg-line" />
          <span className="mt-4 block h-1 w-[70%] rounded-full bg-line" />
        </span>
      </motion.span>
      <motion.span aria-hidden="true" className="absolute left-[42%] top-[19%] z-10 h-[40%] w-[34%]" {...paperMotion(0.065)}>
        <span className="block size-full rotate-[2deg] rounded-[9px] border border-line bg-background p-2 transition-transform duration-200 group-hover:-translate-y-1.5">
          <span className="block h-1 w-[84%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[62%] rounded-full bg-line" />
          <span className="mt-4 block h-1 w-[74%] rounded-full bg-line" />
        </span>
      </motion.span>
      <motion.span aria-hidden="true" className="absolute left-[24%] top-[13%] z-10 h-[47%] w-[48%]" {...paperMotion(0.09)}>
        <span className="block size-full -rotate-[9deg] rounded-[10px] border border-line bg-background p-2.5 transition-transform duration-200 group-hover:-translate-y-2">
          <span className="block h-1 w-[86%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[64%] rounded-full bg-line" />
          <span className="mt-5 block h-1 w-[76%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[52%] rounded-full bg-line" />
        </span>
      </motion.span>

      <div className="absolute inset-x-0 bottom-0 z-20 h-[61%] rounded-t-[18px] border-t border-white/50 bg-surface/75 backdrop-blur-lg">
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
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
              <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold leading-tight tracking-[-.25px] text-ink">{workspace.title}</strong>
            )}
            <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-medium text-ink/70">{metadata}</span>
          </div>
          <time className="shrink-0 rounded-full border border-line bg-background px-2 py-1 text-[10px] font-medium tabular-nums text-ink/70" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
        </div>
      </div>
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
          {editing ? (
            <div className={cardLinkClass} aria-label={`Edit ${workspace.title}`}>{cardBody}</div>
          ) : (
            <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className={cardLinkClass} aria-label={`Open ${workspace.title}`}>{cardBody}</Link>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onRename}><Pencil size={13} /> Edit title</ContextMenuItem>
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
              <span className="text-[11px] font-medium text-ink/70 transition-colors duration-200 group-hover:text-accent">
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
                  className="w-full min-h-0 py-1.5 px-2 text-[11px]"
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
                    size="sm"
                    className="flex-1 min-h-0 py-1 text-[10px]"
                    disabled={!value.trim() || loading}
                  >
                    {loading ? "Creating…" : "Create"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-0 py-1 px-2.5 text-[10px]"
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

type WorkspaceLibraryProps = {
  model: WorkspaceLibraryModel;
};

export function WorkspaceLibrary({ model }: WorkspaceLibraryProps) {
  const {
    view,
    categoryItems,
    page,
    pageLoading,
    categoryLoadError,
    allLoadError,
    retryAll,
    retryCategory,
    updateCategoryPageState,
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
    openAll,
  } = model;

  return (
    <>
      <h1 id="library-list-title" className="sr-only">{heading}</h1>
      {!(view === "all" && page?.total === 0 && !pageLoading && !allLoadError) && <h2 className="mb-5 text-[21px] font-semibold tracking-tight text-ink">{view === "category" ? heading : "Your workspaces"}</h2>}
      <section className="min-w-0" aria-labelledby="library-list-title">
        {pageLoading ? <WorkspaceListSkeleton /> : (view === "all" ? allLoadError : categoryLoadError) ? (
          <div role="alert" className="flex min-h-[130px] flex-col items-start justify-center gap-3 rounded-md border border-line bg-surface px-4 py-5">
            <p className="m-0 text-[11px] text-danger">
              {view === "category" ? "Category workspaces" : "Workspaces"} could not be loaded. {view === "all" ? allLoadError : categoryLoadError}
            </p>
            <Button variant="secondary" size="sm" onClick={view === "all" ? retryAll : retryCategory}>Retry</Button>
          </div>
        ) : items.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,196px))] gap-4 max-[560px]:grid-cols-[repeat(auto-fill,minmax(156px,180px))]" role="group" aria-label={view === "category" ? "Category workspaces" : "All workspaces"}>
            {items.map((workspace) => (
              <WorkspaceFolderCard key={workspace.id} workspace={workspace}
                categoryTitle={categoryItems.find((category) => category.id === workspace.categoryId)?.title}
                entering={workspace.id === recentlyCreatedWorkspaceId}
                editing={editingWorkspaceId === workspace.id} editingTitle={workspaceTitleDraft}
                editLoading={savingWorkspaceId === workspace.id}
                onEditingTitleChange={setWorkspaceTitleDraft}
                onCommitTitle={() => void saveWorkspaceTitle(workspace)}
                onCancelTitle={cancelWorkspaceRename}
                onRename={() => beginWorkspaceRename(workspace)}
                onDelete={() => setDeletingWorkspace(workspace)} />
            ))}
            <NewWorkspaceCard editing={creatingWorkspace} value={newWorkspaceTitle} loading={createLoading}
                onActivate={() => { setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}
                onChange={setNewWorkspaceTitle}
                onSubmit={(event) => { void handleCreateWorkspace(event); }}
                onCancel={() => { setCreatingWorkspace(false); setNewWorkspaceTitle(""); }} />
          </div>
        ) : view === "all" && page?.total === 0 ? (
          <section className="mx-auto flex max-w-[940px] flex-col gap-8 py-8 max-[700px]:py-3" aria-label="Welcome to Notespace">
            <div className="grid grid-cols-[minmax(250px,1fr)_minmax(280px,1.1fr)] items-center gap-8 max-[800px]:grid-cols-1">
              <div className="flex flex-col items-start gap-3">
                <span className="text-[11px] font-medium text-accent">Notespace workspace</span>
                <h2 className="m-0 text-[28px] font-semibold leading-[1.3] text-ink">A space for ideas to take shape.</h2>
                <p className="m-0 max-w-sm text-[13px] leading-6 text-muted">
                  Start a Workspace to map sketches, diagrams and code on one Canvas.
                </p>
                {!creatingWorkspace ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={() => { setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}>
                      <Plus size={15} aria-hidden="true" /> Create Workspace
                    </Button>
                    <Button type="button" variant="secondary"
                      onClick={() => window.dispatchEvent(new Event("notespace:open-settings-data"))}>
                      Restore backup
                    </Button>
                  </div>
                ) : (
                  <form className="mt-2 flex w-full max-w-sm items-center gap-2" onSubmit={(event) => { void handleCreateWorkspace(event); }}>
                    <Input autoFocus aria-label="Workspace name" placeholder="Workspace name" value={newWorkspaceTitle}
                      onChange={(event) => setNewWorkspaceTitle(event.target.value)} disabled={createLoading} />
                    <Button size="sm" type="submit" disabled={!newWorkspaceTitle.trim() || createLoading}>
                      {createLoading ? "Creating…" : "Create"}
                    </Button>
                    <Button size="sm" type="button" variant="secondary" onClick={() => setCreatingWorkspace(false)} disabled={createLoading}>Cancel</Button>
                  </form>
                )}
              </div>
              <div className="relative min-h-[270px] overflow-hidden rounded-lg border border-line bg-canvas p-5" aria-label="Example knowledge map">
                <div className="mb-4 flex items-center justify-between border-b border-line pb-3 text-[10px] text-muted">
                  <span>Untitled Canvas</span><span>100%</span>
                </div>
                <div className="relative mx-auto h-[195px] max-w-[360px]">
                  <svg className="absolute inset-0 size-full" viewBox="0 0 360 195" fill="none" aria-hidden="true">
                    <path d="M151 44C118 44 93 83 93 102M209 45C238 45 264 83 264 100M95 124C95 153 128 161 148 161M260 125C260 153 239 160 216 161" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="5 5" opacity=".65" />
                  </svg>
                  <div className="absolute left-[26%] top-1 w-[48%] rounded-lg border border-accent/25 bg-surface px-3 py-2 text-[12px] font-semibold text-ink">Database internals</div>
                  <div className="absolute left-0 top-[43%] w-[44%] rounded-lg border border-line bg-surface px-3 py-3">
                    <div className="text-[11px] font-semibold text-ink">MVCC</div>
                    <div className="mt-2 h-1 w-4/5 rounded-full bg-line" />
                    <div className="mt-1 h-1 w-3/5 rounded-full bg-line" />
                  </div>
                  <div className="absolute right-0 top-[43%] w-[40%] rounded-lg border border-line bg-surface px-3 py-3">
                    <div className="text-[11px] font-semibold text-ink">Transactions</div>
                    <div className="mt-2 h-1 w-4/5 rounded-full bg-line" />
                    <div className="mt-1 h-1 w-3/5 rounded-full bg-line" />
                  </div>
                  <div className="absolute bottom-0 left-[30%] w-[42%] rounded-lg border border-line bg-surface px-3 py-2 text-center text-[11px] font-medium text-ink">Isolation levels</div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-5 rounded-lg border border-line bg-surface p-8 text-center">
            <div>
              <span className="mb-4 mx-auto grid size-10 place-items-center rounded-md bg-tint text-accent"><Folder size={20} /></span>
              <h2 className="m-0 text-lg font-medium">{view === "category" ? "No workspaces in this category" : "No workspaces here"}</h2>
              <p className="mt-2 mb-0 text-xs leading-normal text-ink/70">Create your first workspace using the card below.</p>
            </div>
            <NewWorkspaceCard editing={creatingWorkspace} value={newWorkspaceTitle} loading={createLoading}
              onActivate={() => { setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}
              onChange={setNewWorkspaceTitle}
              onSubmit={(event) => { void handleCreateWorkspace(event); }}
              onCancel={() => { setCreatingWorkspace(false); setNewWorkspaceTitle(""); }} />
          </div>
        )}
      </section>
      {(view === "all" || view === "category") && page && page.total > page.limit && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-[10px] text-ink/70" aria-label="Workspace pages">
          <Button variant="secondary" size="sm" className="min-h-[30px] px-2.5 py-1.5 text-[10px]" disabled={!page.offset || pageLoading} onClick={() => view === "category" ? updateCategoryPageState({ offset: Math.max(0, page.offset - page.limit) }) : void openAll(Math.max(0, page.offset - page.limit), true)}>Previous</Button>
          <span>{page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total}</span>
          <Button variant="secondary" size="sm" className="min-h-[30px] px-2.5 py-1.5 text-[10px]" disabled={page.nextOffset === undefined || pageLoading} onClick={() => view === "category" ? updateCategoryPageState({ offset: page.nextOffset ?? page.offset }) : void openAll(page.nextOffset ?? page.offset, true)}>Next</Button>
        </nav>
      )}
      <ConfirmDialog
        open={!!deletingWorkspace}
        title="Delete this workspace?"
        description={deletingWorkspace ? `“${deletingWorkspace.title}” will be removed.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeletingWorkspace(null); }}
        onConfirm={() => void confirmDeleteWorkspace()}
      />
    </>
  );
}
