import { useEffect, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, FileText, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { ThemeToggle } from "../../providers/theme-provider";
import { Input } from "../../components/ui";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { createProject, deleteProject, listCategoryWorkspaces, renameProject, updateCategory } from "../../domain/project/api";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

export function CategoryDetail({ category, initialPage }: { category: CategorySummary; initialPage: WorkspacePage }) {
  const [page, setPage] = useState(initialPage);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [hasCanvas, setHasCanvas] = useState(false);
  const [hasNotes, setHasNotes] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryTitle, setCategoryTitle] = useState(category.title);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [workspaceTitle, setWorkspaceTitle] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState<ProjectSummary | null>(null);
  const navigate = useNavigate(); const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void listCategoryWorkspaces(category.id, { query, sort, hasCanvas, hasNotes, offset, limit: 50 }).then((result) => { if (!cancelled) setPage(result); }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load workspaces."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [category.id, query, sort, hasCanvas, hasNotes, offset]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim() || creating) return;
    setCreating(true); setError("");
    try { const workspace = await createProject(title.trim(), category.id); setTitle(""); await router.invalidate(); await navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: workspace.id } }); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not create workspace."); }
    finally { setCreating(false); }
  }
  async function saveCategory() { if (!categoryTitle.trim() || categoryTitle === category.title) { setEditingCategory(false); return; } try { await updateCategory(category.id, categoryTitle.trim()); setEditingCategory(false); await router.invalidate(); } catch (err) { setError(err instanceof Error ? err.message : "Could not rename category."); } }
  function beginWorkspaceRename(workspace: ProjectSummary) { setEditingWorkspace(workspace.id); setWorkspaceTitle(workspace.title); }
  async function saveWorkspace() { if (!editingWorkspace || !workspaceTitle.trim()) return; try { await renameProject(editingWorkspace, workspaceTitle.trim()); setEditingWorkspace(null); await router.invalidate(); } catch (err) { setError(err instanceof Error ? err.message : "Could not rename workspace."); } }
  async function removeWorkspace() { if (!deletingWorkspace) return; const workspace = deletingWorkspace; setDeletingWorkspace(null); try { await deleteProject(workspace.id); await router.invalidate(); } catch (err) { setError(err instanceof Error ? err.message : "Could not delete workspace."); } }

  return <div className="dashboard-shell category-detail-shell"><header className="topbar dashboard-header"><div><Link to="/" className="back-link"><ArrowLeft size={15} /> Home</Link><span className="dashboard-context">/</span><span className="dashboard-context">Category</span></div><ThemeToggle /></header><main className="category-detail-content">
    <div className="category-detail-heading"><div>{editingCategory ? <Input className="inline-dashboard-input category-detail-title-input" autoFocus value={categoryTitle} onChange={(event) => setCategoryTitle(event.target.value)} onBlur={() => void saveCategory()} onKeyDown={(event) => { if (event.key === "Enter") void saveCategory(); if (event.key === "Escape") { setCategoryTitle(category.title); setEditingCategory(false); } }} /> : <button className="plain-title-button" onClick={() => setEditingCategory(true)}>{category.title}<Pencil size={14} /></button>}<p>{page.total} workspace{page.total === 1 ? "" : "s"}</p></div><form className="quick-create" onSubmit={create}>{creating ? null : <Input aria-label="Workspace title" placeholder="New workspace" value={title} onChange={(event) => setTitle(event.target.value)} />}{!creating && <button className="primary" disabled={!title.trim()}><Plus size={15} /> Add workspace</button>}</form></div>
    <div className="category-toolbar"><label className="scoped-search"><Search size={15} aria-hidden="true" /><Input aria-label="Search this category" placeholder="Search this category…" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} /></label><select aria-label="Sort workspaces" value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }}><option value="updated">Recently edited</option><option value="created">Recently created</option><option value="name">Alphabetical</option><option value="notes">Most notes</option></select><label className="filter-check"><input type="checkbox" checked={hasNotes} onChange={(event) => { setHasNotes(event.target.checked); setOffset(0); }} /> Has notes</label><label className="filter-check"><input type="checkbox" checked={hasCanvas} onChange={(event) => { setHasCanvas(event.target.checked); setOffset(0); }} /> Has canvas</label></div>
    {error && <p className="dashboard-inline-error" role="alert">{error}</p>}
    <div className="workspace-browser" aria-busy={loading}>{loading && <div className="browser-loading">Loading workspaces…</div>}{!loading && !page.items.length ? <div className="empty-state category-empty"><span className="empty-mark"><FileText size={22} /></span><h2>{query || hasNotes || hasCanvas ? "No matching workspaces" : "No workspaces yet"}</h2><p>{query || hasNotes || hasCanvas ? "Try another filter or search." : "Create the first workspace in this category."}</p></div> : <><div className="workspace-browser-header"><span>Workspace</span><span>Content</span><span>Updated</span><span aria-hidden="true" /></div>{page.items.map((workspace) => <div className="browser-row" key={workspace.id}>{editingWorkspace === workspace.id ? <input className="inline-dashboard-input browser-name-input" autoFocus value={workspaceTitle} onChange={(event) => setWorkspaceTitle(event.target.value)} onBlur={() => void saveWorkspace()} onKeyDown={(event) => { if (event.key === "Enter") void saveWorkspace(); if (event.key === "Escape") setEditingWorkspace(null); }} /> : <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="browser-workspace-link"><FileText size={15} /><strong>{workspace.title}</strong></Link>}<span className="browser-content">{workspace.noteCount ?? 0} notes{workspace.hasCanvas ? " · canvas" : ""}</span><time dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time><details className="workspace-menu"><summary className="icon-button" aria-label={`Actions for ${workspace.title}`}><MoreHorizontal size={16} /></summary><div className="workspace-menu-popover workspace-menu-right"><button className="menu-item" onClick={() => beginWorkspaceRename(workspace)}><Pencil size={14} /> Rename</button><button className="menu-item menu-item-danger" onClick={() => setDeletingWorkspace(workspace)}><Trash2 size={14} /> Delete</button></div></details></div>)}</>}</div>
    {page.total > page.limit && <nav className="pagination" aria-label="Workspace pages"><button className="secondary" disabled={!page.offset} onClick={() => setOffset(Math.max(0, page.offset - page.limit))}>Previous</button><span>{page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total}</span><button className="secondary" disabled={page.nextOffset === undefined} onClick={() => setOffset(page.nextOffset ?? page.offset)}>Next</button></nav>}
  </main><ConfirmDialog open={!!deletingWorkspace} title="Delete this workspace?" description={deletingWorkspace ? `“${deletingWorkspace.title}” will be removed.` : ""} confirmLabel="Delete" onOpenChange={(open) => { if (!open) setDeletingWorkspace(null); }} onConfirm={() => void removeWorkspace()} /></div>;
}
