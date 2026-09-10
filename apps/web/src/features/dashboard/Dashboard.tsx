import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Folder, Menu, Search } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Button, IconButton, Input, PopupSurface, cn } from "../../components/ui";
import { ThemeToggle } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import { useDismissablePopup } from "../../components/ui/dismissable";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { listAllWorkspaces, listCategoryWorkspaces, listRecentWorkspaces, searchNotespace } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { useLibrarySyncStore } from "../library/library-sync-store";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";
import { WorkspaceGuide } from "../workspace/WorkspaceGuide";
import { WorkspaceListSkeleton } from "../../components/feedback/WorkspaceListSkeleton";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type Props = { categories: CategorySummary[]; recentWorkspaces: ProjectSummary[]; initialSelectedCategoryId?: string; initialCategoryPage?: WorkspacePage };
type LibraryView = "recent" | "all" | "category";

const tabClass = "border-0 border-b-2 border-b-transparent bg-transparent px-2.5 py-2 text-[10px] text-muted";
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
      className="group block min-h-20 rounded-[18px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 max-[560px]:inset-x-4 max-[560px]:bottom-4">
            <div className="min-w-0">
              <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold leading-tight tracking-[-.25px] text-ink max-[560px]:text-[18px]">{workspace.title}</strong>
              <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-muted max-[560px]:text-[10px]">{metadata}</span>
            </div>
            <time className="shrink-0 rounded-full border border-line bg-surface/80 px-2 py-1 text-[8px] tabular-nums text-muted max-[560px]:text-[9px]" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function Dashboard({ categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const libraryRevision = useLibrarySyncStore((state) => state.revision);
  const handledLibraryRevision = useRef(libraryRevision);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [view, setView] = useState<LibraryView>(initialSelectedCategoryId ? "category" : "recent");
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialSelectedCategoryId ?? "");
  const [recentItems, setRecentItems] = useState(recentWorkspaces);
  const [page, setPage] = useState<WorkspacePage | null>(initialCategoryPage ?? null);
  const [pageLoading, setPageLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const dismissSearch = useCallback(() => setSearchOpen(false), []);
  useDismissablePopup(searchRef, searchOpen, dismissSearch);
  const selectedCategory = useMemo(() => categories.find((category) => category.id === selectedCategoryId), [categories, selectedCategoryId]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    let cancelled = false;
    void searchNotespace(normalized).then((results) => { if (!cancelled) setSearchResults(results.slice(0, 10)); }).catch((err) => { if (!cancelled) { setSearchResults([]); showToast({ kind: "error", message: err instanceof Error ? err.message : "Search is unavailable." }); } });
    return () => { cancelled = true; };
  }, [query, showToast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus(); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!mobileLibraryOpen) return undefined;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileLibraryOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileLibraryOpen]);

  async function selectCategory(id: string, force = false) {
    if (id === selectedCategoryId && !force) return;
    setSelectedCategoryId(id); setView("category"); setPageLoading(true);
    try { const result = await listCategoryWorkspaces(id, { limit: 50 }); setPage(result); }
    catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load category workspaces." }); }
    finally { setPageLoading(false); }
  }

  async function openAll() {
    setView("all"); setSelectedCategoryId(""); setPageLoading(true);
    try { const result = await listAllWorkspaces({ limit: 50 }); setPage(result); }
    catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load workspaces." }); }
    finally { setPageLoading(false); }
  }

  function searchHref(result: SearchResult) {
    if (result.type === "category" && result.categoryId) return `/categories/${encodeURIComponent(result.categoryId)}`;
    if (result.type === "workspace") return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
    return `/workspaces/${encodeURIComponent(result.workspaceId)}?note=${encodeURIComponent(result.noteId)}${result.blockId ? `&block=${encodeURIComponent(result.blockId)}` : ""}`;
  }

  const refreshLibrary = useCallback(() => {
    void router.invalidate();
    void listRecentWorkspaces(20)
      .then(setRecentItems)
      .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." }));

    if (view === "all") {
      setPageLoading(true);
      void listAllWorkspaces({ limit: 50 })
        .then(setPage)
        .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." }))
        .finally(() => setPageLoading(false));
      return;
    }

    if (view === "category" && selectedCategoryId) {
      setPageLoading(true);
      void listCategoryWorkspaces(selectedCategoryId, { limit: 50 })
        .then(setPage)
        .catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh category workspaces." }))
        .finally(() => setPageLoading(false));
    }
  }, [router, selectedCategoryId, showToast, view]);

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
    <div className={cn(
      "dashboard-shell grid min-h-dvh max-[560px]:grid-cols-[minmax(0,1fr)]",
      collapsed
        ? "grid-cols-[60px_minmax(0,1fr)] max-[560px]:grid-cols-[minmax(0,1fr)]"
        : "grid-cols-[minmax(0,224px)_minmax(0,1fr)] max-[560px]:grid-cols-[minmax(0,1fr)]",
    )}>
      <button
        type="button"
        className={cn("fixed inset-0 z-[70] hidden bg-black/20 backdrop-blur-[1px] max-[560px]:block", !mobileLibraryOpen && "max-[560px]:hidden")}
        aria-label="Close library navigation"
        onClick={() => setMobileLibraryOpen(false)}
      />
      <div className={cn(
        "contents max-[560px]:fixed max-[560px]:inset-y-0 max-[560px]:left-0 max-[560px]:z-[80] max-[560px]:block max-[560px]:w-[min(320px,86vw)] max-[560px]:transition-transform max-[560px]:duration-200 [&>aside]:max-[560px]:!h-dvh [&>aside]:max-[560px]:!max-h-none [&>aside]:max-[560px]:!w-full [&>aside]:max-[560px]:!border-r [&>aside]:max-[560px]:!border-b-0 [&>aside]:max-[560px]:!px-3 [&>aside]:max-[560px]:!py-3.5",
        mobileLibraryOpen ? "max-[560px]:translate-x-0" : "max-[560px]:-translate-x-full",
      )}>
        <Sidebar
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          collapsed={mobileLibraryOpen ? false : collapsed}
          onToggle={() => { if (mobileLibraryOpen) setMobileLibraryOpen(false); else setCollapsed((value) => !value); }}
          onSelectCategory={(id) => { void selectCategory(id); setMobileLibraryOpen(false); }}
        />
      </div>
      <main className="min-h-dvh min-w-0 max-[560px]:min-h-0">
        <header className="hidden min-h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 max-[560px]:flex">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconButton type="button" className="!size-9 shrink-0" aria-label="Open library navigation" onClick={() => setMobileLibraryOpen(true)}><Menu size={18} /></IconButton>
            <span className="truncate text-sm font-medium text-ink">Library</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 [&>button]:size-[32px]"><WorkspaceGuide /><ThemeToggle /></div>
        </header>
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-surface px-6 max-[560px]:hidden">
          <span className="text-[10px] font-medium uppercase tracking-[.12em] text-muted">Library</span>
          <div className="flex items-center gap-1.5 [&>button]:size-[30px]"><WorkspaceGuide /><ThemeToggle /></div>
        </header>
        <div className="mx-auto w-full max-w-[1120px] px-8 pt-10 pb-12 max-[800px]:px-5 max-[800px]:pt-7 max-[800px]:pb-9 max-[560px]:p-4 max-[560px]:pt-5">
          <div className="mb-7 flex items-end justify-between gap-5 max-[560px]:mb-4 max-[560px]:items-start max-[560px]:gap-3">
            <div className="min-w-0"><p className="m-0 text-[10px] font-medium uppercase tracking-[.12em] text-accent max-[560px]:text-[9px]">Resume your work</p><h1 id="library-list-title" className="mt-2 mb-0 text-[30px] font-medium leading-none tracking-[-.8px] text-ink max-[560px]:text-[25px]">{heading}</h1><p className="mt-2 mb-0 text-xs text-muted max-[560px]:text-[11px]">{description}</p></div>
            <span className="shrink-0 pb-1 text-[10px] text-muted max-[560px]:pt-5 max-[560px]:pb-0">{workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}</span>
          </div>
          <div ref={searchRef} className="relative mb-4 flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-muted shadow-[0_1px_2px_#0000000a] focus-within:border-accent focus-within:ring-2 focus-within:ring-tint">
            <Search size={15} aria-hidden="true" />
            <Input
              ref={searchInput}
              className="min-h-0 flex-1 rounded-none border-0 bg-transparent px-0 py-2.5 text-xs focus:border-transparent focus:ring-0"
              aria-label="Search Notespace"
              placeholder="Search notes, blocks, workspaces, categories…"
              value={query}
              onFocus={() => setSearchOpen(query.trim().length >= 2)}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(event.target.value.trim().length >= 2); }}
            />
            {query.trim().length >= 2 && searchOpen && (
              <PopupSurface className="absolute top-[calc(100%+4px)] right-0 left-0 z-20 grid max-h-[min(60dvh,420px)] gap-0.5 overflow-y-auto p-1.5" role="listbox" aria-label="Search results">
                {searchResults.length ? searchResults.map((result) => (
                  <a key={`${result.type}-${result.workspaceId}-${result.noteId}-${result.blockId}`} href={searchHref(result)} role="option" className="grid gap-0.5 rounded-md px-2.5 py-2 hover:bg-tint focus-visible:bg-tint focus-visible:outline-2 focus-visible:outline-accent">
                    <strong className="text-[11px] font-medium text-ink">{result.type === "category" ? result.categoryTitle : result.type === "workspace" ? result.workspaceTitle : result.noteTitle}</strong>
                    <span className="text-[10px] text-muted">{result.type === "category" ? "Category" : `${result.workspaceTitle} · ${result.excerpt || "Open note"}`}</span>
                  </a>
                )) : <span className="px-2.5 py-2 text-[10px] text-muted">No matching knowledge</span>}
              </PopupSurface>
            )}
          </div>
          <nav className="mb-4 flex items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0" aria-label="Library views">
            <Button variant="ghost" size="sm" className={cn(tabClass, view === "recent" && "border-b-accent text-ink")} onClick={() => setView("recent")}>Recent</Button>
            <Button variant="ghost" size="sm" className={cn(tabClass, view === "all" && "border-b-accent text-ink")} onClick={() => void openAll()}>All workspaces</Button>
            {selectedCategory && <Button variant="ghost" size="sm" className={cn(tabClass, view === "category" && "border-b-accent text-ink")} onClick={() => void selectCategory(selectedCategory.id)}>{selectedCategory.title}</Button>}
          </nav>
          <section className="min-w-0" aria-labelledby="library-list-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[11px] font-medium text-ink">Workspaces</h2>
              <span className="text-[10px] text-muted">Updated recently</span>
            </div>
            {pageLoading ? <WorkspaceListSkeleton variant="cards" /> : items.length ? (
              <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1 min-[1041px]:grid-cols-4">
                {items.map((workspace) => (
                  <WorkspaceFolderCard key={workspace.id} workspace={workspace} categoryTitle={categories.find((category) => category.id === workspace.categoryId)?.title} />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-[18px] border border-line bg-surface p-8 text-center">
                <span className="mb-4 grid size-10 place-items-center rounded-md bg-tint text-accent"><Folder size={20} /></span>
                <h2 className="m-0 text-lg font-medium">{view === "recent" ? "No recent workspaces" : "No workspaces here"}</h2>
                <p className="mt-2 mb-0 text-xs leading-normal text-muted">Create a workspace from the library menu.</p>
              </div>
            )}
          </section>
          {showLearningActivity && <StudyActivityDashboard />}
        </div>
      </main>
    </div>
  );
}