import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { FileText, Folder, Menu, Search } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Button, IconButton, Input, PopupSurface, cn } from "../../components/ui";
import { ThemeToggle } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import { useDismissablePopup } from "../../components/ui/dismissable";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { listAllWorkspaces, listCategoryWorkspaces, listRecentWorkspaces, searchNotespace } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";
import { WorkspaceGuide } from "../workspace/WorkspaceGuide";
import { WorkspaceListSkeleton } from "../../components/feedback/WorkspaceListSkeleton";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type Props = { categories: CategorySummary[]; recentWorkspaces: ProjectSummary[]; initialSelectedCategoryId?: string; initialCategoryPage?: WorkspacePage };
type LibraryView = "recent" | "all" | "category";

const tabClass = "border-0 border-b-2 border-b-transparent bg-transparent px-2.5 py-2 text-[10px] text-muted";

export function Dashboard({ categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
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

  function refreshLibrary() { void router.invalidate(); void listRecentWorkspaces(20).then(setRecentItems).catch((err) => showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not refresh workspaces." })); if (selectedCategoryId) void selectCategory(selectedCategoryId, true); }
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
          onChanged={refreshLibrary}
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
          <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface" aria-labelledby="library-list-title">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="m-0 text-[11px] font-medium text-ink">Workspaces</h2>
              <span className="text-[10px] text-muted">Updated recently</span>
            </div>
            {pageLoading ? <WorkspaceListSkeleton /> : items.length ? (
              <div>
                {items.map((workspace) => (
                  <Link key={workspace.id} to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="group grid min-h-20 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 text-ink transition-colors last:border-b-0 hover:bg-tint focus-visible:bg-tint max-[560px]:min-h-[72px] max-[560px]:grid-cols-[32px_minmax(0,1fr)] max-[560px]:gap-2.5">
                    <span className="grid size-9 place-items-center rounded-md bg-tint text-accent transition-colors group-hover:bg-surface max-[560px]:size-8"><FileText size={17} /></span>
                    <span className="grid min-w-0 gap-1"><strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">{workspace.title}</strong><span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted">{view === "all" ? `${categories.find((category) => category.id === workspace.categoryId)?.title ?? "Category"} · ` : ""}{workspace.noteCount ?? 0} note{workspace.noteCount === 1 ? "" : "s"}{workspace.hasCanvas ? " · Canvas" : ""}</span></span>
                    <time className="text-[10px] text-muted max-[560px]:hidden" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center">
                <span className="mb-4 grid size-10 place-items-center rounded-md bg-tint text-accent"><Folder size={20} /></span>
                <h2 className="m-0 text-lg font-medium">{view === "recent" ? "No recent workspaces" : "No workspaces here"}</h2>
                <p className="mt-2 mb-0 text-xs leading-normal text-muted">Create a workspace from the library menu.</p>
              </div>
            )}
          </section>
          <StudyActivityDashboard />
        </div>
      </main>
    </div>
  );
}