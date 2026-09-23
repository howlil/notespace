import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Folder, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Input, cn } from "../../components/ui";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { ThemeToggle } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { createProject, deleteProject, listAllWorkspaces, listCategories, listCategoryWorkspaces, listRecentWorkspaces, renameProject } from "../../domain/project/api";
import { notifyLibraryChanged, useLibrarySyncStore } from "../../features/library/library-sync-store";
import { workspaceMutationError, workspaceRenameTitle } from "../../features/library/workspace-mutation-policy";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import { StudyActivityDashboard } from "../../features/study/StudyActivityDashboard";
import { WorkspaceGuide } from "../../features/workspace/WorkspaceGuide";
import { WorkspaceListSkeleton } from "../../components/feedback/WorkspaceListSkeleton";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type Props = { categories: CategorySummary[]; recentWorkspaces: ProjectSummary[]; initialSelectedCategoryId?: string; initialCategoryPage?: WorkspacePage };
type LibraryView = "recent" | "all" | "category";

const tabClass = "relative border-0 bg-transparent px-3 py-2 text-[11px] font-medium text-ink/70 after:pointer-events-none after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[3px] after:rounded-full after:bg-transparent hover:bg-tint hover:text-ink focus-visible:bg-tint";
const showLearningActivity = false;

type WorkspaceFolderCardProps = {
  workspace: ProjectSummary;
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

export function HomePage({ categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const libraryRevision = useLibrarySyncStore((state) => state.revision);
  const handledLibraryRevision = useRef(libraryRevision);
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
  const [deletingWorkspace, setDeletingWorkspace] = useState<ProjectSummary | null>(null);
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
      const workspace = await createProject(title, newWorkspaceCategoryId);
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

  function beginWorkspaceRename(workspace: ProjectSummary) {
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

  function replaceWorkspaceInLists(updated: ProjectSummary) {
    const replace = (workspace: ProjectSummary) => workspace.id === updated.id ? { ...workspace, ...updated } : workspace;
    setRecentItems((current) => current.map(replace));
    setPage((current) => current ? { ...current, items: current.items.map(replace) } : current);
  }

  async function saveWorkspaceTitle(workspace: ProjectSummary) {
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
      const renamed = await renameProject(workspace.id, value);
      replaceWorkspaceInLists(renamed);
      setEditingWorkspaceId(null);
      setWorkspaceTitleDraft("");
      workspaceRenameCancelled.current = false;
      notifyLibraryChanged();
      showToast({ kind: "success", message: "Workspace renamed." });
    } catch (err) {
      showToast({ kind: "error", message: workspaceMutationError(err, "Could not rename workspace.") });
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
      await deleteProject(target.id, target.version);
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
      showToast({ kind: "error", message: workspaceMutationError(err, "Could not delete workspace.") });
    }
  }

  async function selectCategory(id: string, force = false) {
    if (id === selectedCategoryId && !force) return;
    setSelectedCategoryId(id); setView("category"); setPageLoading(true);
    try { const result = await listCategoryWorkspaces(id, { limit: 50 }); setPage(result); }
    catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load category workspaces." }); }
    finally { setPageLoading(false); }
  }

  async function openAll(offset = 0) {
    setView("all"); setSelectedCategoryId(""); setPageLoading(true);
    try { const result = await listAllWorkspaces({ offset, limit: 50 }); setPage(result); }
    catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load workspaces." }); }
    finally { setPageLoading(false); }
  }

  const refreshLibrary = useCallback((options: { silent?: boolean } = {}) => {
    const silent = options.silent ?? false;
    void listRecentWorkspaces(20)
      .then(setRecentItems)
      .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." }));

    if (view === "all") {
      if (!silent) setPageLoading(true);
      void listAllWorkspaces({ limit: 50 })
        .then(setPage)
        .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." }))
        .finally(() => { if (!silent) setPageLoading(false); });
    }

    if (view === "category" && selectedCategoryId && !silent) setPageLoading(true);
    void listCategories()
      .then((nextCategories) => {
        setCategoryItems(nextCategories);
        if (view !== "category" || !selectedCategoryId) return;
        if (!nextCategories.some((category) => category.id === selectedCategoryId)) {
          setSelectedCategoryId("");
          setView("recent");
          setPage(null);
          setPageLoading(false);
          void navigate({ to: "/" });
          return;
        }
        void listCategoryWorkspaces(selectedCategoryId, { limit: 50 })
          .then(setPage)
          .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh category workspaces." }))
          .finally(() => { if (!silent) setPageLoading(false); });
      })
      .catch((err) => {
        if (view === "category" && !silent) setPageLoading(false);
        showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh categories." });
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

  return (
    <div className="dashboard-shell grid min-h-dvh grid-cols-[minmax(0,224px)_minmax(0,1fr)] max-[560px]:grid-cols-[minmax(0,1fr)]">
      <Sidebar
        categories={categoryItems}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={(id) => { void selectCategory(id); }}
        onChanged={refreshLibrary}
      />
      <main className="min-h-dvh min-w-0 max-[560px]:min-h-0">
        <header className="relative z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 max-[560px]:gap-2 max-[560px]:px-3">
          <button
            type="button"
            className="flex min-h-9 w-[min(320px,42vw)] min-w-[190px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-left text-ink/70 transition-colors hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[560px]:min-h-8 max-[560px]:w-full max-[560px]:min-w-0"
            aria-label="Search Notespace with Control K or Command K"
            onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}
          >
            <Search size={15} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">Search Notespace</span>
            <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink/60">Ctrl/⌘ K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1 [&>button]:size-[30px] [&>button]:text-ink max-[560px]:[&>button]:size-[32px]"><WorkspaceGuide /><ThemeToggle /></div>
        </header>
        <div className="mx-auto w-full max-w-[1240px] px-6 pt-5 pb-8 max-[800px]:px-5 max-[800px]:pt-5 max-[800px]:pb-7 max-[560px]:p-4 max-[560px]:pt-4">
          <h1 id="library-list-title" className="sr-only">{heading}</h1>
          <nav className="mb-5 flex items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0" aria-label="Library views">
            <Button variant="ghost" size="sm" aria-current={view === "recent" ? "page" : undefined} className={cn(tabClass, view === "recent" && "font-semibold text-accent after:bg-accent")} onClick={() => setView("recent")}>Recent</Button>
            <Button variant="ghost" size="sm" aria-current={view === "all" ? "page" : undefined} className={cn(tabClass, view === "all" && "font-semibold text-accent after:bg-accent")} onClick={() => void openAll()}>All workspaces</Button>
          </nav>
          <section className="min-w-0" aria-labelledby="library-list-title">
            {pageLoading ? <WorkspaceListSkeleton variant="cards" /> : items.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,196px))] gap-4 max-[560px]:grid-cols-[repeat(auto-fill,minmax(156px,180px))]">
                {items.map((workspace) => (
                  <WorkspaceFolderCard
                    key={workspace.id}
                    workspace={workspace}
                    categoryTitle={categoryItems.find((category) => category.id === workspace.categoryId)?.title}
                    entering={workspace.id === recentlyCreatedWorkspaceId}
                    editing={editingWorkspaceId === workspace.id}
                    editingTitle={workspaceTitleDraft}
                    editLoading={savingWorkspaceId === workspace.id}
                    onEditingTitleChange={setWorkspaceTitleDraft}
                    onCommitTitle={() => void saveWorkspaceTitle(workspace)}
                    onCancelTitle={cancelWorkspaceRename}
                    onRename={() => beginWorkspaceRename(workspace)}
                    onDelete={() => setDeletingWorkspace(workspace)}
                  />
                ))}
                <NewWorkspaceCard
                  editing={creatingWorkspace}
                  value={newWorkspaceTitle}
                  loading={createLoading}
                  onActivate={() => { setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}
                  onChange={setNewWorkspaceTitle}
                  onSubmit={(e) => { void handleCreateWorkspace(e); }}
                  onCancel={() => { setCreatingWorkspace(false); setNewWorkspaceTitle(""); }}
                />
              </div>
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-5 rounded-lg border border-line bg-surface p-8 text-center">
                <div>
                  <span className="mb-4 grid size-10 place-items-center rounded-md bg-tint text-accent mx-auto"><Folder size={20} /></span>
                  <h2 className="m-0 text-lg font-medium">{view === "recent" ? "No recent workspaces" : "No workspaces here"}</h2>
                  <p className="mt-2 mb-0 text-xs leading-normal text-ink/70">Create your first workspace below or use the library menu.</p>
                </div>
                <NewWorkspaceCard
                  editing={creatingWorkspace}
                  value={newWorkspaceTitle}
                  loading={createLoading}
                  onActivate={() => { setCreatingWorkspace(true); setNewWorkspaceTitle(""); }}
                  onChange={setNewWorkspaceTitle}
                  onSubmit={(e) => { void handleCreateWorkspace(e); }}
                  onCancel={() => { setCreatingWorkspace(false); setNewWorkspaceTitle(""); }}
                />
              </div>
            )}
          </section>
          {view === "all" && page && page.total > page.limit && (
            <nav className="mt-4 flex items-center justify-center gap-3 text-[10px] text-ink/70" aria-label="Workspace pages">
              <Button variant="secondary" size="sm" className="min-h-[30px] px-2.5 py-1.5 text-[10px]" disabled={!page.offset || pageLoading} onClick={() => void openAll(Math.max(0, page.offset - page.limit))}>Previous</Button>
              <span>{page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total}</span>
              <Button variant="secondary" size="sm" className="min-h-[30px] px-2.5 py-1.5 text-[10px]" disabled={page.nextOffset === undefined || pageLoading} onClick={() => void openAll(page.nextOffset ?? page.offset)}>Next</Button>
            </nav>
          )}
          {showLearningActivity && <StudyActivityDashboard />}
        </div>
      </main>
      <ConfirmDialog
        open={!!deletingWorkspace}
        title="Delete this workspace?"
        description={deletingWorkspace ? `“${deletingWorkspace.title}” will be removed.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeletingWorkspace(null); }}
        onConfirm={() => void confirmDeleteWorkspace()}
      />
    </div>
  );
}
