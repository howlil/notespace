import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { FileText, Folder, Search } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Input, cn } from "../../components/ui";
import { ThemeToggle } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import { useDismissablePopup } from "../../components/ui/dismissable";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { listAllWorkspaces, listCategoryWorkspaces, listRecentWorkspaces, searchNotespace } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type Props = { categories: CategorySummary[]; recentWorkspaces: ProjectSummary[]; initialSelectedCategoryId?: string; initialCategoryPage?: WorkspacePage };
type LibraryView = "recent" | "all" | "category";

const tabClass = "border-0 border-b-2 border-b-transparent bg-transparent px-2.5 py-2 text-[10px] text-muted";

export function Dashboard({ categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
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

  return (
    <div className={cn(
      "grid min-h-dvh max-[560px]:grid-cols-[minmax(0,1fr)] max-[560px]:grid-rows-[auto_minmax(0,1fr)]",
      collapsed
        ? "grid-cols-[60px_minmax(0,1fr)] max-[560px]:grid-cols-[minmax(0,1fr)]"
        : "grid-cols-[minmax(0,224px)_minmax(0,1fr)] max-[560px]:grid-cols-[minmax(0,1fr)]",
    )}>
      <Sidebar categories={categories} selectedCategoryId={selectedCategoryId} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onSelectCategory={(id) => void selectCategory(id)} onChanged={refreshLibrary} />
      <main className="min-h-dvh min-w-0">
        <header className="flex min-h-12 items-center justify-end gap-3 border-b border-line bg-surface px-6 max-[560px]:px-5">
          <div className="ml-auto flex items-center gap-2.5 [&>button]:size-[30px]"><ThemeToggle /></div>
        </header>
        <div className="mx-auto w-full max-w-[1200px] px-8 pt-[29px] pb-9 max-[800px]:px-[18px] max-[800px]:pt-[22px] max-[800px]:pb-[30px] max-[560px]:p-5 max-[560px]:pt-6">
          <div className="mb-[22px] flex items-center justify-between gap-5 max-[800px]:items-start max-[560px]:flex-col max-[560px]:items-stretch max-[560px]:gap-3">
            <div><h1 id="library-list-title" className="m-0 text-[23px] font-medium leading-tight tracking-[-.5px] text-ink">{heading}</h1><p className="mt-[5px] mb-0 text-[11px] text-muted">{description}</p></div>
          </div>
          <div ref={searchRef} className="relative mb-[18px] flex min-h-9 items-center gap-2 border-b border-line px-[11px] text-muted">
            <Search size={15} aria-hidden="true" />
            <Input
              ref={searchInput}
              className="min-h-0 flex-1 rounded-none border-0 bg-transparent px-0 py-2 text-[11px] focus:border-transparent"
              aria-label="Search Notespace"
              placeholder="Search notes, blocks, workspaces, categories…"
              value={query}
              onFocus={() => setSearchOpen(query.trim().length >= 2)}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(event.target.value.trim().length >= 2); }}
            />
            {query.trim().length >= 2 && searchOpen && (
              <div className="absolute top-[calc(100%+4px)] right-0 left-0 z-20 grid gap-0.5 rounded-[7px] border border-line bg-surface p-[5px] shadow-[0_10px_24px_#0002]" role="listbox" aria-label="Search results">
                {searchResults.length ? searchResults.map((result) => (
                  <a key={`${result.type}-${result.workspaceId}-${result.noteId}-${result.blockId}`} href={searchHref(result)} role="option" className="grid gap-0.5 rounded-[5px] px-[9px] py-2 hover:bg-tint focus-visible:bg-tint">
                    <strong className="text-[11px] font-medium text-ink">{result.type === "category" ? result.categoryTitle : result.type === "workspace" ? result.workspaceTitle : result.noteTitle}</strong>
                    <span className="text-[10px] text-muted">{result.type === "category" ? "Category" : `${result.workspaceTitle} · ${result.excerpt || "Open note"}`}</span>
                  </a>
                )) : <span className="px-[9px] py-2 text-[10px] text-muted">No matching knowledge</span>}
              </div>
            )}
          </div>
          <nav className="mb-[17px] flex items-center gap-1 border-b border-line" aria-label="Library views">
            <button className={cn(tabClass, view === "recent" && "border-b-accent text-ink")} onClick={() => setView("recent")}>Recent</button>
            <button className={cn(tabClass, view === "all" && "border-b-accent text-ink")} onClick={() => void openAll()}>All workspaces</button>
            {selectedCategory && <button className={cn(tabClass, view === "category" && "border-b-accent text-ink")} onClick={() => void selectCategory(selectedCategory.id)}>{selectedCategory.title}</button>}
          </nav>
          <section className="min-w-0" aria-labelledby="library-list-title">
            {pageLoading ? <p className="py-6 text-[11px] text-muted">Loading workspaces…</p> : items.length ? (
              <div className="border-t border-line">
                {items.map((workspace) => (
                  <Link key={workspace.id} to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="grid min-h-[62px] grid-cols-[28px_minmax(0,1fr)_78px] items-center gap-2.5 border-b border-line px-[11px] text-ink hover:bg-tint focus-visible:bg-tint max-[800px]:grid-cols-[28px_minmax(0,1fr)_16px]">
                    <span className="text-accent"><FileText size={16} /></span>
                    <span className="grid min-w-0 gap-1"><strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">{workspace.title}</strong><span className="text-[10px] text-muted">{view === "all" ? `${categories.find((category) => category.id === workspace.categoryId)?.title ?? "Category"} · ` : ""}{workspace.noteCount ?? 0} note{workspace.noteCount === 1 ? "" : "s"}{workspace.hasCanvas ? " · Canvas" : ""}</span></span>
                    <time className="text-[10px] text-muted max-[800px]:hidden" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-line bg-surface p-[35px] text-center">
                <span className="mb-[15px] grid size-[46px] place-items-center rounded-[7px] bg-tint text-accent"><Folder size={22} /></span>
                <h2 className="m-0 text-lg font-medium">{view === "recent" ? "No recent workspaces" : "No workspaces here"}</h2>
                <p className="mt-2 mb-[18px] text-[13px] leading-normal text-muted">Create a workspace from the sidebar.</p>
              </div>
            )}
          </section>
          <StudyActivityDashboard compact />
        </div>
      </main>
    </div>
  );
}
