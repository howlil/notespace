import { Link } from "@tanstack/react-router";
import { FileText, Folder, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent, ReactNode } from "react";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Input, cn } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import type { WorkspaceSummary } from "../../domain/workspace/workspace";
import { WorkspaceListSkeleton } from "./WorkspaceListSkeleton";
import type { WorkspaceLibraryModel } from "./use-workspace-library";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
const tabClass = "relative border-0 bg-transparent px-3 py-2 text-[11px] font-medium text-ink/70 after:pointer-events-none after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[3px] after:rounded-full after:bg-transparent hover:bg-tint hover:text-ink focus-visible:bg-tint";

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
  const noteCount = workspace.noteCount ?? 0;
  const metadata = [
    categoryTitle,
    `${noteCount} note${noteCount === 1 ? "" : "s"}`,
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

/** The category detail is an information-dense list, not another discovery grid. */
function CategoryWorkspaceRow(props: WorkspaceFolderCardProps) {
  const { workspace, editing, editingTitle = "", editLoading, onEditingTitleChange, onCommitTitle,
    onCancelTitle, onRename, onDelete } = props;
  const meta = [`${workspace.noteCount ?? 0} notes`, workspace.hasCanvas ? "Canvas" : null]
    .filter(Boolean).join(" · ");
  const content = (
    <div className="flex min-h-[58px] min-w-0 items-center gap-3 px-3 py-2 hover:bg-tint/50">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-background text-accent"><FileText size={16} /></span>
      <span className="min-w-0 flex-1">
        {editing ? (
          <Input autoFocus aria-label="Workspace title" value={editingTitle} disabled={editLoading}
            onChange={(event) => onEditingTitleChange?.(event.target.value)}
            onBlur={() => onCommitTitle?.()}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); onCommitTitle?.(); }
              if (event.key === "Escape") { event.preventDefault(); onCancelTitle?.(); }
            }}
            className="!min-h-7 w-full max-w-[340px] rounded-md px-2 text-[12px]" />
        ) : (
          <strong className="block truncate text-[12px] font-medium text-ink">{workspace.title}</strong>
        )}
        <span className="block truncate text-[10px] text-muted">{meta}</span>
      </span>
      <time className="shrink-0 text-[10px] tabular-nums text-muted" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
    </div>
  );
  return (
    <div role="listitem">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {editing ? <div>{content}</div> : (
            <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }}
              className="block min-w-0 text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              aria-label={`Open ${workspace.title}`}>{content}</Link>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onRename}><Pencil size={13} /> Edit title</ContextMenuItem>
          <ContextMenuItem className="text-danger" onSelect={onDelete}><Trash2 size={13} /> Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
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
  afterList?: ReactNode;
};

export function WorkspaceLibrary({ model, afterList }: WorkspaceLibraryProps) {
  const {
    view,
    categoryItems,
    page,
    pageLoading,
    categoryLoadError,
    retryCategory,
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
    openRecent,
    openAll,
  } = model;

  return (
    <>
      <h1 id="library-list-title" className="sr-only">{heading}</h1>
      <nav className="mb-5 flex items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0" aria-label="Library views">
        <Button variant="ghost" size="sm" aria-current={view === "recent" ? "page" : undefined} className={cn(tabClass, view === "recent" && "font-semibold text-accent after:bg-accent")} onClick={openRecent}>Recent</Button>
        <Button variant="ghost" size="sm" aria-current={view === "all" ? "page" : undefined} className={cn(tabClass, view === "all" && "font-semibold text-accent after:bg-accent")} onClick={() => void openAll()}>All workspaces</Button>
      </nav>
      {view === "category" && (
        <div className="mb-4 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 truncate text-[17px] font-semibold text-ink">{heading}</h2>
            <span className="text-[10px] tabular-nums text-muted">{page?.total ?? 0} workspaces</span>
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-label="Category filters">
            <label className="flex min-h-8 min-w-[180px] flex-1 items-center gap-2 rounded-md border border-line bg-surface px-2.5 focus-within:outline-2 focus-within:outline-accent">
              <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
              <Input type="search" aria-label="Search category workspaces" value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)} placeholder="Search in category…"
                className="!min-h-7 min-w-0 w-full rounded-none border-0 bg-transparent px-0 text-[11px] focus:outline-none" />
            </label>
            <select aria-label="Sort category workspaces" value={categoryFilters.sort}
              onChange={(event) => updateCategoryFilters({ sort: event.target.value as "" | "created" | "name" | "notes" })}
              className="min-h-8 rounded-md border border-line bg-surface px-2 text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-accent">
              <option value="">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name</option>
              <option value="notes">Most notes</option>
            </select>
            <Button type="button" variant="ghost" size="sm" aria-pressed={categoryFilters.hasNotes}
              className={cn("border border-line text-[10px]", categoryFilters.hasNotes && "bg-tint text-accent")}
              onClick={() => updateCategoryFilters({ hasNotes: !categoryFilters.hasNotes })}>Has notes</Button>
            <Button type="button" variant="ghost" size="sm" aria-pressed={categoryFilters.hasCanvas}
              className={cn("border border-line text-[10px]", categoryFilters.hasCanvas && "bg-tint text-accent")}
              onClick={() => updateCategoryFilters({ hasCanvas: !categoryFilters.hasCanvas })}>Has canvas</Button>
          </div>
        </div>
      )}
      <section className="min-w-0" aria-labelledby="library-list-title">
        {pageLoading ? <WorkspaceListSkeleton variant={view === "category" ? "list" : "cards"} /> : view === "category" && categoryLoadError ? (
          <div role="alert" className="flex min-h-[130px] flex-col items-start justify-center gap-3 border-y border-line bg-surface px-4 py-5">
            <p className="m-0 text-[11px] text-danger">Category workspaces could not be loaded. {categoryLoadError}</p>
            <Button variant="secondary" size="sm" onClick={retryCategory}>Retry</Button>
          </div>
        ) : items.length ? (
          view === "category" ? (
            <div className="divide-y divide-line border-y border-line bg-surface" role="list" aria-label="Category workspaces">
              {items.map((workspace) => (
                <CategoryWorkspaceRow key={workspace.id} workspace={workspace}
                  editing={editingWorkspaceId === workspace.id}
                  editingTitle={workspaceTitleDraft} editLoading={savingWorkspaceId === workspace.id}
                  onEditingTitleChange={setWorkspaceTitleDraft}
                  onCommitTitle={() => void saveWorkspaceTitle(workspace)}
                  onCancelTitle={cancelWorkspaceRename}
                  onRename={() => beginWorkspaceRename(workspace)}
                  onDelete={() => setDeletingWorkspace(workspace)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,196px))] gap-4 max-[560px]:grid-cols-[repeat(auto-fill,minmax(156px,180px))]">
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
          )
        ) : (
          view === "category" ? (
            <div className="border-y border-line px-3 py-8 text-center text-[11px] text-muted">
              No workspaces match this category view.
            </div>
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-5 rounded-lg border border-line bg-surface p-8 text-center">
              <div>
                <span className="mb-4 mx-auto grid size-10 place-items-center rounded-md bg-tint text-accent"><Folder size={20} /></span>
                <h2 className="m-0 text-lg font-medium">{view === "recent" ? "No recent workspaces" : "No workspaces here"}</h2>
                <p className="mt-2 mb-0 text-xs leading-normal text-ink/70">Create your first workspace below or use the library menu.</p>
              </div>
              <NewWorkspaceCard editing={creatingWorkspace} value={newWorkspaceTitle} loading={createLoading}
                onActivate={() => { setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}
                onChange={setNewWorkspaceTitle}
                onSubmit={(event) => { void handleCreateWorkspace(event); }}
                onCancel={() => { setCreatingWorkspace(false); setNewWorkspaceTitle(""); }} />
            </div>
          )
        )}
        {view === "category" && (
          <div className="mt-2">
            {creatingWorkspace ? (
              <form className="flex items-center gap-2" onSubmit={(event) => { void handleCreateWorkspace(event); }}>
                <Input autoFocus aria-label="New workspace name" placeholder="Workspace name"
                  className="min-h-8 flex-1 text-[11px]" value={newWorkspaceTitle}
                  onChange={(event) => setNewWorkspaceTitle(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") setCreatingWorkspace(false); }} />
                <Button size="sm" type="submit" disabled={createLoading || !newWorkspaceTitle.trim()}>{createLoading ? "Creating…" : "Create"}</Button>
                <Button size="sm" variant="ghost" type="button" disabled={createLoading} onClick={() => setCreatingWorkspace(false)}>Cancel</Button>
              </form>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="text-accent"
                onClick={() => { setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}>
                <Plus size={14} /> New workspace
              </Button>
            )}
          </div>
        )}
      </section>
      {(view === "all" || view === "category") && page && page.total > page.limit && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-[10px] text-ink/70" aria-label="Workspace pages">
          <Button variant="secondary" size="sm" className="min-h-[30px] px-2.5 py-1.5 text-[10px]" disabled={!page.offset || pageLoading} onClick={() => view === "category" ? updateCategoryFilters({ offset: Math.max(0, page.offset - page.limit) }) : void openAll(Math.max(0, page.offset - page.limit), true)}>Previous</Button>
          <span>{page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total}</span>
          <Button variant="secondary" size="sm" className="min-h-[30px] px-2.5 py-1.5 text-[10px]" disabled={page.nextOffset === undefined || pageLoading} onClick={() => view === "category" ? updateCategoryFilters({ offset: page.nextOffset ?? page.offset }) : void openAll(page.nextOffset ?? page.offset, true)}>Next</Button>
        </nav>
      )}
      {afterList}
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
