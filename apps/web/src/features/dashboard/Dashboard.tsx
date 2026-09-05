import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { FileText, Folder, Search } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Input } from "../../components/ui";
import { ThemeToggle } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import { useDismissablePopup } from "../../components/ui/dismissable";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { listAllWorkspaces, listCategoryWorkspaces, listRecentWorkspaces, searchNotespace } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";
import "./dashboard.css";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type Props = { categories: CategorySummary[]; recentWorkspaces: ProjectSummary[]; initialSelectedCategoryId?: string; initialCategoryPage?: WorkspacePage };
type LibraryView = "recent" | "all" | "category";

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

  return <div className={collapsed ? "app-shell dashboard-app-shell sidebar-collapsed" : "app-shell dashboard-app-shell"}><Sidebar categories={categories} selectedCategoryId={selectedCategoryId} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onSelectCategory={(id) => void selectCategory(id)} onChanged={refreshLibrary} /><main className="dashboard">
    <header className="topbar dashboard-header"><div className="dashboard-topbar-actions"><ThemeToggle /></div></header>
    <div className="dashboard-content">
      <div className="dashboard-heading"><div><h1 id="library-list-title">{heading}</h1><p>{description}</p></div></div>
      <div ref={searchRef} className="global-search"><Search size={15} aria-hidden="true" /><Input ref={searchInput} aria-label="Search Notespace" placeholder="Search notes, blocks, workspaces, categories…" value={query} onFocus={() => setSearchOpen(query.trim().length >= 2)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(event.target.value.trim().length >= 2); }} />{query.trim().length >= 2 && searchOpen && <div className="global-search-results" role="listbox" aria-label="Search results">{searchResults.length ? searchResults.map((result) => <a key={`${result.type}-${result.workspaceId}-${result.noteId}-${result.blockId}`} href={searchHref(result)} role="option" className="search-result"><strong>{result.type === "category" ? result.categoryTitle : result.type === "workspace" ? result.workspaceTitle : result.noteTitle}</strong><span>{result.type === "category" ? "Category" : `${result.workspaceTitle} · ${result.excerpt || "Open note"}`}</span></a>) : <span className="search-result-empty">No matching knowledge</span>}</div>}</div>
      <nav className="library-tabs" aria-label="Library views"><button className={view === "recent" ? "library-tab active" : "library-tab"} onClick={() => setView("recent")}>Recent</button><button className={view === "all" ? "library-tab active" : "library-tab"} onClick={() => void openAll()}>All workspaces</button>{selectedCategory && <button className={view === "category" ? "library-tab active" : "library-tab"} onClick={() => void selectCategory(selectedCategory.id)}>{selectedCategory.title}</button>}</nav>
      <section className="library-main-pane" aria-labelledby="library-list-title">{pageLoading ? <p className="library-loading">Loading workspaces…</p> : items.length ? <div className="workspace-library-list">{items.map((workspace) => <Link key={workspace.id} to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="workspace-library-row"><span className="workspace-row-icon"><FileText size={16} /></span><span className="workspace-row-copy"><strong>{workspace.title}</strong><span>{view === "all" ? `${categories.find((category) => category.id === workspace.categoryId)?.title ?? "Category"} · ` : ""}{workspace.noteCount ?? 0} note{workspace.noteCount === 1 ? "" : "s"}{workspace.hasCanvas ? " · Canvas" : ""}</span></span><time dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time></Link>)}</div> : <div className="empty-state category-empty"><span className="empty-mark"><Folder size={22} /></span><h2>{view === "recent" ? "No recent workspaces" : "No workspaces here"}</h2><p>Create a workspace from the sidebar.</p></div>}</section>
      <StudyActivityDashboard compact />
    </div>
  </main></div>;
}
