import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, FileText, Folder, Search } from "lucide-react";
import { Sidebar, Brand } from "../../app/Sidebar";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { createProject, listAllWorkspaces, listCategoryWorkspaces, listRecentWorkspaces, searchNotespace } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

type Props = { categories: CategorySummary[]; recentWorkspaces: ProjectSummary[]; initialSelectedCategoryId?: string; initialCategoryPage?: WorkspacePage };
type LibraryView = "recent" | "all" | "category";

export function Dashboard({ categories, recentWorkspaces, initialSelectedCategoryId, initialCategoryPage }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<LibraryView>(initialSelectedCategoryId ? "category" : "recent");
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialSelectedCategoryId ?? "");
  const [recentItems, setRecentItems] = useState(recentWorkspaces);
  const [page, setPage] = useState<WorkspacePage | null>(initialCategoryPage ?? null);
  const [pageCategoryId, setPageCategoryId] = useState(initialSelectedCategoryId ?? "");
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState(initialSelectedCategoryId ?? categories[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const selectedCategory = useMemo(() => categories.find((category) => category.id === selectedCategoryId), [categories, selectedCategoryId]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) { setSearchResults([]); setSearchError(""); return; }
    let cancelled = false;
    void searchNotespace(normalized).then((results) => { if (!cancelled) setSearchResults(results.slice(0, 10)); }).catch((err) => { if (!cancelled) { setSearchResults([]); setSearchError(err instanceof Error ? err.message : "Search is unavailable."); } });
    return () => { cancelled = true; };
  }, [query]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus(); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  async function selectCategory(categoryId: string, force = false) {
    setSelectedCategoryId(categoryId); setView("category"); setPageError("");
    if (!force && pageCategoryId === categoryId && page) return;
    setPageLoading(true);
    try { setPage(await listCategoryWorkspaces(categoryId, { limit: 50 })); setPageCategoryId(categoryId); }
    catch (err) { setPageError(err instanceof Error ? err.message : "Could not load this category."); }
    finally { setPageLoading(false); }
  }

  async function openAll() {
    setView("all"); setPageError(""); setPageLoading(true);
    try { setPage(await listAllWorkspaces({ limit: 50 })); setPageCategoryId(""); }
    catch (err) { setPageError(err instanceof Error ? err.message : "Could not load all workspaces."); }
    finally { setPageLoading(false); }
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!createTitle.trim() || !createCategoryId) return;
    try {
      await createProject(createTitle.trim(), createCategoryId);
      setCreateTitle(""); setCreatingWorkspace(false); setRecentItems(await listRecentWorkspaces(20)); await router.invalidate();
      if (createCategoryId === selectedCategoryId) await selectCategory(createCategoryId);
    } catch (err) { setPageError(err instanceof Error ? err.message : "Could not create workspace."); }
  }

  function searchHref(result: SearchResult) {
    if (result.type === "category" && result.categoryId) return `/categories/${encodeURIComponent(result.categoryId)}`;
    if (result.type === "workspace") return `/projects/${encodeURIComponent(result.workspaceId)}`;
    return `/projects/${encodeURIComponent(result.workspaceId)}?note=${encodeURIComponent(result.noteId)}${result.blockId ? `&block=${encodeURIComponent(result.blockId)}` : ""}`;
  }

  function refreshLibrary() { void router.invalidate(); void listRecentWorkspaces(20).then(setRecentItems).catch(() => {}); if (selectedCategoryId) void selectCategory(selectedCategoryId, true); }
  const items = view === "recent" ? recentItems : (page?.items ?? []);
  const heading = view === "recent" ? "Recent workspaces" : view === "all" ? "All workspaces" : selectedCategory?.title ?? "Category";
  const description = view === "recent" ? "Pick up where you left off." : view === "all" ? "Browse the complete workspace library in bounded pages." : `${page?.total ?? selectedCategory?.workspaceCount ?? 0} workspace${(page?.total ?? selectedCategory?.workspaceCount ?? 0) === 1 ? "" : "s"}`;

  return <div className={collapsed ? "app-shell dashboard-app-shell sidebar-collapsed" : "app-shell dashboard-app-shell"}><Sidebar categories={categories} selectedCategoryId={selectedCategoryId} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onSelectCategory={(id) => void selectCategory(id)} onChanged={refreshLibrary} /><main className="dashboard">
    <header className="topbar dashboard-header"><div><Link to="/" className="dashboard-brand" aria-label="Notespace home"><Brand /></Link><span className="dashboard-context">Library</span></div><span className="library-count">{categories.length} categor{categories.length === 1 ? "y" : "ies"}</span></header>
    <div className="dashboard-content">
      <div className="dashboard-heading"><div><p className="eyebrow">LIBRARY</p><h1>Knowledge, organized.</h1><p>Categories hold workspaces. Choose a workspace to start authoring.</p></div>{creatingWorkspace ? <form className="quick-create" onSubmit={(event) => void createWorkspace(event)}><input autoFocus aria-label="Workspace title" placeholder="Workspace name" value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreatingWorkspace(false); }} /><select aria-label="Workspace category" value={createCategoryId} onChange={(event) => setCreateCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select><button className="primary" disabled={!createTitle.trim() || !createCategoryId}>Create</button><button type="button" className="icon-button" aria-label="Cancel new workspace" onClick={() => setCreatingWorkspace(false)}>×</button></form> : <button className="primary" onClick={() => setCreatingWorkspace(true)}>+ New workspace</button>}</div>
      <div className="global-search"><Search size={15} aria-hidden="true" /><input ref={searchInput} aria-label="Search Notespace" placeholder="Search notes, blocks, workspaces, categories…" value={query} onChange={(event) => setQuery(event.target.value)} />{query.trim().length >= 2 && <div className="global-search-results" role="listbox" aria-label="Search results">{searchError ? <span className="search-result-empty search-result-error">{searchError}</span> : searchResults.length ? searchResults.map((result) => <a key={`${result.type}-${result.workspaceId}-${result.noteId}-${result.blockId}`} href={searchHref(result)} role="option" className="search-result"><strong>{result.type === "category" ? result.categoryTitle : result.type === "workspace" ? result.workspaceTitle : result.noteTitle}</strong><span>{result.type === "category" ? "Category" : `${result.workspaceTitle} · ${result.excerpt || "Open note"}`}</span></a>) : <span className="search-result-empty">No matching knowledge</span>}</div>}</div>
      <nav className="library-tabs" aria-label="Library views"><button className={view === "recent" ? "library-tab active" : "library-tab"} onClick={() => setView("recent")}>Recent</button><button className={view === "all" ? "library-tab active" : "library-tab"} onClick={() => void openAll()}>All workspaces</button>{selectedCategory && <button className={view === "category" ? "library-tab active" : "library-tab"} onClick={() => void selectCategory(selectedCategory.id)}>{selectedCategory.title}</button>}</nav>
      <section className="library-main-pane" aria-labelledby="library-list-title"><div className="section-heading"><div><p className="eyebrow">{view === "category" ? "SELECTED CATEGORY" : "WORKSPACE LIBRARY"}</p><h2 id="library-list-title">{heading}</h2><p>{description}</p></div>{view === "category" && selectedCategory && <Link className="secondary compact-action" to="/categories/$categoryId" params={{ categoryId: selectedCategory.id }}>Manage category <ArrowRight size={14} /></Link>}</div>{pageError && <p className="dashboard-inline-error" role="alert">{pageError}</p>}{pageLoading ? <p className="library-loading">Loading workspaces…</p> : items.length ? <div className="workspace-library-list">{items.map((workspace) => <Link key={workspace.id} to="/projects/$projectId" params={{ projectId: workspace.id }} className="workspace-library-row"><span className="workspace-row-icon"><FileText size={16} /></span><span className="workspace-row-copy"><strong>{workspace.title}</strong><span>{view === "all" ? `${categories.find((category) => category.id === workspace.categoryId)?.title ?? "Category"} · ` : ""}{workspace.noteCount ?? 0} note{workspace.noteCount === 1 ? "" : "s"}{workspace.hasCanvas ? " · Canvas" : ""}</span></span><time dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time><ArrowRight size={15} /></Link>)}</div> : <div className="empty-state category-empty"><span className="empty-mark"><Folder size={22} /></span><h2>{view === "recent" ? "No recent workspaces" : "No workspaces here"}</h2><p>Use New workspace in the Library sidebar to create one without leaving this view.</p></div>}</section>
      <StudyActivityDashboard compact />
    </div>
  </main></div>;
}
