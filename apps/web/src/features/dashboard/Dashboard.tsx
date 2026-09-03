import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, FileText, Layers, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Sidebar, Brand } from "../../app/Sidebar";
import { ThemeToggle } from "../../app/theme";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { createCategory, createProject, deleteCategory, searchNotespace, updateCategory } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
type CreateTarget = { kind: "category" } | { kind: "workspace"; category?: CategorySummary };

export function Dashboard({ categories, workspaces }: { categories: CategorySummary[]; workspaces: ProjectSummary[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const categoryRenameCancelled = useRef(false);
  const [title, setTitle] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate(); const router = useRouter();
  const recentWorkspaces = useMemo(() => workspaces.slice(0, 6), [workspaces]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) { setSearchResults([]); setSearchError(""); return; }
    let cancelled = false; setSearchError("");
    void searchNotespace(query).then((results) => { if (!cancelled) setSearchResults(results.slice(0, 10)); }).catch((err) => { if (!cancelled) { setSearchResults([]); setSearchError(err instanceof Error ? err.message : "Search is unavailable. Please retry."); } });
    return () => { cancelled = true; };
  }, [searchQuery]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus(); }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function beginCreate(target: CreateTarget) { setError(""); setTitle(""); if (target.kind === "workspace") { setSelectedCategoryId(target.category?.id ?? categories[0]?.id ?? ""); setCreateTarget({ kind: "workspace" }); return; } setCreateTarget(target); }
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!createTarget || busy || !title.trim()) return; setBusy(true); setError("");
    try {
      if (createTarget.kind === "category") await createCategory(title.trim());
      else { const categoryId = createTarget.category?.id ?? selectedCategoryId; if (!categoryId) { setError("Create a category first."); return; } const workspace = await createProject(title.trim(), categoryId); setCreateTarget(null); await router.invalidate(); await navigate({ to: "/projects/$projectId", params: { projectId: workspace.id } }); return; }
      setCreateTarget(null); await router.invalidate();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create this item."); } finally { setBusy(false); }
  }
  function beginCategoryRename(category: CategorySummary) { categoryRenameCancelled.current = false; setError(""); setTitle(category.title); setEditingCategoryId(category.id); }
  async function commitCategoryRename() { if (categoryRenameCancelled.current) { categoryRenameCancelled.current = false; return; } if (!editingCategoryId || busy || !title.trim()) return; setBusy(true); setError(""); try { await updateCategory(editingCategoryId, title.trim()); setEditingCategoryId(null); await router.invalidate(); } catch (err) { setError(err instanceof Error ? err.message : "Could not rename this category."); } finally { setBusy(false); } }
  async function removeCategory(category: CategorySummary) { if (busy) return; setBusy(true); setError(""); try { await deleteCategory(category.id); setDeletingCategoryId(null); await router.invalidate(); } catch (err) { setError(err instanceof Error ? err.message : "Delete or move the workspaces in this category first."); } finally { setBusy(false); } }
  function toggleCategory(id: string) { setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function searchHref(result: SearchResult) {
    if (result.type === "category" && result.categoryId) return `/categories/${encodeURIComponent(result.categoryId)}`;
    if (result.type === "workspace") return `/projects/${encodeURIComponent(result.workspaceId)}`;
    return `/projects/${encodeURIComponent(result.workspaceId)}?note=${encodeURIComponent(result.noteId)}${result.blockId ? `&block=${encodeURIComponent(result.blockId)}` : ""}`;
  }

  return <div className={collapsed ? "app-shell dashboard-app-shell sidebar-collapsed" : "app-shell dashboard-app-shell"}><Sidebar categories={categories} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} /><main className="dashboard">
    <header className="topbar dashboard-header"><div><Link to="/" className="dashboard-brand" aria-label="Notespace home"><Brand /></Link><span className="dashboard-context">Home</span></div><ThemeToggle /></header>
    <div className="dashboard-content">
      <div className="dashboard-heading"><div><h1>Home</h1><p>Continue where you left off.</p></div>{categories.length ? (createTarget?.kind === "workspace" && !createTarget.category ? <form className="quick-create" onSubmit={create}><input aria-label="Workspace title" autoFocus autoComplete="off" placeholder="Workspace name" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} /><select aria-label="Workspace category" value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select><button className="primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add"}</button><button type="button" className="icon-button" aria-label="Cancel new workspace" onClick={() => setCreateTarget(null)}>×</button></form> : <button className="primary" onClick={() => beginCreate({ kind: "workspace" })}><Plus size={17} /> New workspace</button>) : <button className="secondary" onClick={() => beginCreate({ kind: "category" })}><Plus size={17} /> Create category</button>}</div>
      <div className="global-search"><Search size={15} aria-hidden="true" /><input ref={searchInput} aria-label="Search Notespace" placeholder="Search notes, blocks, workspaces, categories…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />{searchQuery.trim().length >= 2 && <div className="global-search-results" role="listbox" aria-label="Search results">{searchError ? <span className="search-result-empty search-result-error">{searchError}</span> : searchResults.length ? searchResults.map((result) => <a key={`${result.type}-${result.categoryId}-${result.workspaceId}-${result.noteId}-${result.blockId}-${result.excerpt}`} href={searchHref(result)} role="option" className="search-result"><strong>{result.type === "category" ? result.categoryTitle : result.type === "workspace" ? result.workspaceTitle : result.noteTitle}</strong><span>{result.type === "category" ? "Category" : `${result.workspaceTitle} · ${result.excerpt || "Open note"}`}</span></a>) : <span className="search-result-empty">No matching knowledge</span>}</div>}</div>
      {error && !createTarget && <p className="dashboard-inline-error" role="alert">{error}</p>}
      <section className="recent-section" aria-labelledby="recent-title"><div className="section-heading"><h2 id="recent-title">Recent workspaces</h2></div>{recentWorkspaces.length ? <div className="recent-grid">{recentWorkspaces.map((workspace) => <Link key={workspace.id} to="/projects/$projectId" params={{ projectId: workspace.id }} className="recent-card"><FileText size={16} /><strong>{workspace.title}</strong><time dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time></Link>)}</div> : <p className="section-empty">No workspaces yet. Create one to start.</p>}</section>
      <StudyActivityDashboard compact />
      <section aria-labelledby="categories-title"><div className="section-heading"><div><h2 id="categories-title">Categories</h2><p>{categories.length} categor{categories.length === 1 ? "y" : "ies"} · {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}</p></div>{createTarget?.kind === "category" ? <form className="quick-create" onSubmit={create}><input aria-label="Category title" autoFocus autoComplete="off" placeholder="Category name" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} /><button className="primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add"}</button><button type="button" className="icon-button" aria-label="Cancel new category" onClick={() => setCreateTarget(null)}>×</button></form> : <button className="secondary compact-action" onClick={() => beginCreate({ kind: "category" })}><Plus size={15} /> New category</button>}</div>
        {!categories.length ? <section className="empty-state category-empty"><span className="empty-mark"><Layers size={22} /></span><h2>No categories yet</h2><p>Create one to start organizing workspaces.</p></section> : <div className="category-list">{categories.map((category) => { const categoryWorkspaces = workspaces.filter((workspace) => workspace.categoryId === category.id); const isExpanded = expanded.has(category.id); const preview = categoryWorkspaces.slice(0, 5); const systemCategory = category.title.toLowerCase() === "uncategorized"; return <section className={systemCategory ? "category-card category-card-system" : "category-card"} key={category.id}><div className="category-card-header"><button className="category-summary-toggle" aria-expanded={isExpanded} onClick={() => toggleCategory(category.id)}><span className="category-chevron">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span><span className="category-mark"><Layers size={16} /></span><span className="category-summary-copy">{editingCategoryId === category.id ? <input className="inline-dashboard-input category-name-input" aria-label="Category title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void commitCategoryRename()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitCategoryRename(); } if (event.key === "Escape") { categoryRenameCancelled.current = true; setTitle(category.title); setEditingCategoryId(null); } }} /> : <strong>{category.title}</strong>}<span>{category.workspaceCount} workspace{category.workspaceCount === 1 ? "" : "s"} · updated {editedAt(category.updatedAt)}</span></span></button><div className="category-actions">{deletingCategoryId === category.id ? <span className="inline-confirm"><span>Delete?</span><button className="text-button" onClick={() => setDeletingCategoryId(null)}>Keep</button><button className="text-button danger-text" disabled={busy} onClick={() => void removeCategory(category)}>Delete</button></span> : <details className="workspace-menu"><summary className="icon-button" aria-label={`Actions for ${category.title}`} title="Category actions"><MoreHorizontal size={17} /></summary><div className="workspace-menu-popover workspace-menu-right"><button className="menu-item" onClick={() => beginCategoryRename(category)}><Pencil size={14} /> Rename</button><button className="menu-item" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={14} /> New workspace</button>{category.id !== "legacy" && <button className="menu-item menu-item-danger" onClick={() => setDeletingCategoryId(category.id)}><Trash2 size={14} /> Delete</button>}</div></details>}</div></div>{isExpanded && <div className="category-preview">{preview.map((workspace) => <Link key={workspace.id} to="/projects/$projectId" params={{ projectId: workspace.id }} className="preview-row"><span>{workspace.title}</span><time dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time></Link>)}<Link to="/categories/$categoryId" params={{ categoryId: category.id }} className="view-all-row">{categoryWorkspaces.length > preview.length ? `View all ${category.workspaceCount} workspaces` : "Open category"}<ChevronRight size={14} /></Link>{!categoryWorkspaces.length && <button className="workspace-empty" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={15} /> Create the first workspace</button>}</div>}</section>; })}</div>}
      </section>
    </div>
  </main></div>;
}
