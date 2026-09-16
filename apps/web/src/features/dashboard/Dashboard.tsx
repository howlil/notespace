import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Folder, Plus, Search } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Button, Input, cn } from "../../components/ui";
import { ThemeToggle } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { createProject, listAllWorkspaces, listCategories, listCategoryWorkspaces, listRecentWorkspaces } from "../../domain/project/api";
import { useLibrarySyncStore } from "../library/library-sync-store";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";
import { WorkspaceGuide } from "../workspace/WorkspaceGuide";
import { WorkspaceListSkeleton } from "../../components/feedback/WorkspaceListSkeleton";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type Props = { categories: CategorySummary[]; recentWorkspaces: ProjectSummary[]; initialSelectedCategoryId?: string; initialCategoryPage?: WorkspacePage };
type LibraryView = "recent" | "all" | "category";

const tabClass = "border-0 border-b-2 border-b-transparent bg-transparent px-3 py-2 text-[11px] font-medium text-ink/70 hover:bg-tint hover:text-ink focus-visible:bg-tint";
const showLearningActivity = false;

function WorkspaceFolderCard({ workspace, categoryTitle }: { workspace: ProjectSummary; categoryTitle?: string }) {
  const noteCount = workspace.noteCount ?? 0;
  const metadata = [
    categoryTitle,
    `${noteCount} note${noteCount === 1 ? "" : "s"}`,
    workspace.hasCanvas ? "Canvas" : null,
  ].filter(Boolean).join(" · ");

  return (
    <Link
      to="/workspaces/$workspaceId"
      params={{ workspaceId: workspace.id }}
      className="group block w-full max-w-[196px] min-h-20 rounded-[18px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={`Open ${workspace.title}`}
    >
      <article className="relative aspect-square overflow-hidden rounded-[18px] border border-line bg-accent transition-[transform,border-color] duration-200 group-hover:-translate-y-1 group-hover:border-accent">
        <span aria-hidden="true" className="absolute left-[58%] top-[24%] z-10 h-[35%] w-[27%] rotate-[7deg] rounded-[8px] border border-line bg-surface p-1.5 transition-transform duration-200 group-hover:-translate-y-1">
          <span className="block h-1 w-[82%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[58%] rounded-full bg-line" />
          <span className="mt-4 block h-1 w-[70%] rounded-full bg-line" />
        </span>
        <span aria-hidden="true" className="absolute left-[42%] top-[19%] z-10 h-[40%] w-[34%] rotate-[2deg] rounded-[9px] border border-line bg-surface p-2 transition-transform duration-200 group-hover:-translate-y-1.5">
          <span className="block h-1 w-[84%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[62%] rounded-full bg-line" />
          <span className="mt-4 block h-1 w-[74%] rounded-full bg-line" />
        </span>
        <span aria-hidden="true" className="absolute left-[24%] top-[13%] z-10 h-[47%] w-[48%] -rotate-[9deg] rounded-[10px] border border-line bg-surface p-2.5 transition-transform duration-200 group-hover:-translate-y-2">
          <span className="block h-1 w-[86%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[64%] rounded-full bg-line" />
          <span className="mt-5 block h-1 w-[76%] rounded-full bg-line" />
          <span className="mt-1.5 block h-1 w-[52%] rounded-full bg-line" />
        </span>

        <div className="absolute inset-x-0 bottom-0 z-20 h-[61%] rounded-t-[18px] border-t border-line bg-tint/95 backdrop-blur-sm">
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold leading-tight tracking-[-.25px] text-ink">{workspace.title}</strong>
              <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-medium text-ink/70">{metadata}</span>
            </div>
            <time className="shrink-0 rounded-full border border-line bg-surface/80 px-2 py-1 text-[10px] font-medium tabular-nums text-ink/70" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
          </div>
        </div>
      </article>
    </Link>
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
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="group block w-full max-w-[196px] min-h-20 rounded-[18px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label="New workspace"
      >
        <article className="relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-[18px] border border-dashed border-line bg-surface transition-[border-color,background-color] duration-200 group-hover:border-accent group-hover:bg-tint">
          <span className="grid size-10 place-items-center rounded-full border border-line bg-surface/80 text-ink/70 transition-colors duration-200 group-hover:border-accent group-hover:text-accent">
            <Plus size={18} aria-hidden="true" />
          </span>
          <span className="text-[11px] font-medium text-ink/70 transition-colors duration-200 group-hover:text-accent">
            New workspace
          </span>
        </article>
      </button>
    );
  }

  return (
    <div className="w-full max-w-[196px] min-h-20 rounded-[18px]">
      <article className="relative flex aspect-square flex-col items-center justify-center gap-3 overflow-hidden rounded-[18px] border border-accent bg-tint px-4">
        <form onSubmit={onSubmit} className="w-full grid gap-2">
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
    </div>
  );
}

export function Dashboard({ categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage }: Props) {
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
      await createProject(title, newWorkspaceCategoryId);
      setNewWorkspaceTitle("");
      setCreatingWorkspace(false);
      refreshLibrary();
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not create workspace." });
    } finally {
      setCreateLoading(false);
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

  const refreshLibrary = useCallback(() => {
    void listRecentWorkspaces(20)
      .then(setRecentItems)
      .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." }));

    if (view === "all") {
      setPageLoading(true);
      void listAllWorkspaces({ limit: 50 })
        .then(setPage)
        .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." }))
        .finally(() => setPageLoading(false));
    }

    if (view === "category" && selectedCategoryId) setPageLoading(true);
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
          .finally(() => setPageLoading(false));
      })
      .catch((err) => {
        if (view === "category") setPageLoading(false);
        showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh categories." });
      });
  }, [navigate, selectedCategoryId, showToast, view]);

  useEffect(() => {
    if (handledLibraryRevision.current === libraryRevision) return;
    handledLibraryRevision.current = libraryRevision;
    refreshLibrary();
  }, [libraryRevision, refreshLibrary]);

  const items = view === "recent" ? recentItems : (page?.items ?? []);
  const heading = view === "recent" ? "Recent workspaces" : view === "all" ? "All workspaces" : selectedCategory?.title ?? "Category";
  const description = view === "recent" ? "Pick up where you left off." : view === "all" ? "Browse the complete workspace library in bounded pages." : `${page?.total ?? selectedCategory?.workspaceCount ?? 0} workspace${(page?.total ?? selectedCategory?.workspaceCount ?? 0) === 1 ? "" : "s"}`;
  const workspaceCount = view === "recent" ? recentItems.length : page?.total ?? items.length;

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
            onClick={() => window.dispatchEvent(new Event("open-quick-search"))}
          >
            <Search size={15} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">Search Notespace</span>
            <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink/60">Ctrl/⌘ K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1 [&>button]:size-[30px] [&>button]:text-ink max-[560px]:[&>button]:size-[32px]"><WorkspaceGuide /><ThemeToggle /></div>
        </header>
        <div className="w-full px-8 pt-8 pb-12 max-[800px]:px-5 max-[800px]:pt-7 max-[800px]:pb-9 max-[560px]:p-4 max-[560px]:pt-5">
          <div className="mb-7 flex items-end justify-between gap-5 max-[560px]:mb-4 max-[560px]:items-start max-[560px]:gap-3">
            <div className="min-w-0"><p className="m-0 text-[10px] font-medium uppercase tracking-[.12em] text-accent max-[560px]:text-[9px]">Resume your work</p><h1 id="library-list-title" className="mt-2 mb-0 text-[30px] font-medium leading-none tracking-[-.8px] text-ink max-[560px]:text-[25px]">{heading}</h1><p className="mt-2 mb-0 text-xs text-ink/70 max-[560px]:text-[11px]">{description}</p></div>
            <span className="shrink-0 pb-1 text-[11px] font-medium text-ink/70 max-[560px]:pt-5 max-[560px]:pb-0">{workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}</span>
          </div>
          <nav className="mb-4 flex items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0" aria-label="Library views">
            <Button variant="ghost" size="sm" aria-current={view === "recent" ? "page" : undefined} className={cn(tabClass, view === "recent" && "border-b-accent bg-tint text-accent")} onClick={() => setView("recent")}>Recent</Button>
            <Button variant="ghost" size="sm" aria-current={view === "all" ? "page" : undefined} className={cn(tabClass, view === "all" && "border-b-accent bg-tint text-accent")} onClick={() => void openAll()}>All workspaces</Button>
            {selectedCategory && <Button variant="ghost" size="sm" aria-current={view === "category" ? "page" : undefined} className={cn(tabClass, view === "category" && "border-b-accent bg-tint text-accent")} onClick={() => void selectCategory(selectedCategory.id)}>{selectedCategory.title}</Button>}
          </nav>
          <section className="min-w-0" aria-labelledby="library-list-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="m-0 text-xs font-semibold text-ink">Workspaces</h2>
              <span className="text-[11px] font-medium text-ink/70">Updated recently</span>
            </div>
            {pageLoading ? <WorkspaceListSkeleton variant="cards" /> : items.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,196px))] gap-4 max-[560px]:grid-cols-[repeat(auto-fill,minmax(156px,180px))]">
                {items.map((workspace) => (
                  <WorkspaceFolderCard key={workspace.id} workspace={workspace} categoryTitle={categoryItems.find((category) => category.id === workspace.categoryId)?.title} />
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
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-5 rounded-[18px] border border-line bg-surface p-8 text-center">
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
    </div>
  );
}
