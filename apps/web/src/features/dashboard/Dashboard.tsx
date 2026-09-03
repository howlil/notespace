import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { FileText, Layers, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Brand } from "../../app/Sidebar";
import { ThemeToggle } from "../../app/theme";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { createCategory, createProject, deleteCategory, deleteProject, renameProject, searchNotespace, updateCategory } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { StudyActivityDashboard } from "../study/StudyActivityDashboard";

function editedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

type CreateTarget = { kind: "category" } | { kind: "workspace"; category: CategorySummary };

export function Dashboard({ categories, workspaces }: { categories: CategorySummary[]; workspaces: ProjectSummary[] }) {
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const categoryRenameCancelled = useRef(false);
  const workspaceRenameCancelled = useRef(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    void searchNotespace(query).then((results) => { if (!cancelled) setSearchResults(results.slice(0, 8)); }).catch(() => { if (!cancelled) setSearchResults([]); });
    return () => { cancelled = true; };
  }, [searchQuery]);

  function beginCreate(target: CreateTarget) {
    setError("");
    setTitle("");
    setCreateTarget(target);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!createTarget || busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (createTarget.kind === "category") {
        await createCategory(title.trim());
        setCreateTarget(null);
        await router.invalidate();
        return;
      }
      const workspace = await createProject(title.trim(), createTarget.category.id);
      setCreateTarget(null);
      await router.invalidate();
      await navigate({ to: "/projects/$projectId", params: { projectId: workspace.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this item.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteProject(deleting.id);
      setDeleting(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete workspace.");
    } finally {
      setBusy(false);
    }
  }

  function beginCategoryRename(category: CategorySummary) {
    categoryRenameCancelled.current = false;
    setError("");
    setTitle(category.title);
    setEditingCategoryId(category.id);
  }

  async function commitCategoryRename() {
    if (categoryRenameCancelled.current) { categoryRenameCancelled.current = false; return; }
    const categoryId = editingCategoryId;
    if (!categoryId || busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await updateCategory(categoryId, title.trim());
      setEditingCategoryId(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename this category.");
    } finally {
      setBusy(false);
    }
  }

  function beginWorkspaceRename(workspace: ProjectSummary) {
    workspaceRenameCancelled.current = false;
    setError("");
    setTitle(workspace.title);
    setEditingWorkspaceId(workspace.id);
  }

  async function commitWorkspaceRename() {
    if (workspaceRenameCancelled.current) { workspaceRenameCancelled.current = false; return; }
    const workspaceId = editingWorkspaceId;
    if (!workspaceId || busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await renameProject(workspaceId, title.trim());
      setEditingWorkspaceId(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename this workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: CategorySummary) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteCategory(category.id);
      setDeletingCategoryId(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete the workspaces before deleting this category.");
    } finally {
      setBusy(false);
    }
  }

  const workspaceCount = workspaces.length;
  return (
    <div className="dashboard-shell">
      <main className="dashboard">
        <header className="topbar dashboard-header"><Link to="/" className="dashboard-brand" aria-label="Notespace home"><Brand /></Link><ThemeToggle /></header>
        <div className="dashboard-content">
          <div className="dashboard-heading">
            <div><h1>Categories</h1><p>{categories.length} categor{categories.length === 1 ? "y" : "ies"} <span>·</span> {workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}</p></div>
            {createTarget?.kind === "category" ? <form className="quick-create" onSubmit={create}><input aria-label="Category title" autoFocus autoComplete="off" placeholder="Category name" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreateTarget(null); }} /><button className="primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add"}</button><button type="button" className="icon-button" aria-label="Cancel new category" onClick={() => setCreateTarget(null)}><span aria-hidden="true">×</span></button>{error && <span className="quick-create-error" role="alert">{error}</span>}</form> : <button className="primary" onClick={() => beginCreate({ kind: "category" })}><Plus size={17} /> New category</button>}
          </div>
          <div className="global-search"><Search size={15} aria-hidden="true" /><input aria-label="Search Notespace" placeholder="Search notes, blocks, and workspaces" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />{searchQuery.trim().length >= 2 && <div className="global-search-results" role="listbox" aria-label="Search results">{searchResults.length ? searchResults.map((result) => <a key={`${result.workspaceId}-${result.noteId}-${result.blockId}`} href={`/projects/${encodeURIComponent(result.workspaceId)}?note=${encodeURIComponent(result.noteId)}&block=${encodeURIComponent(result.blockId)}`} role="option" className="search-result"><strong>{result.noteTitle}</strong><span>{result.workspaceTitle} · {result.excerpt || "Open note"}</span></a>) : <span className="search-result-empty">No matching knowledge</span>}</div>}</div>
          {error && !createTarget && <p className="dashboard-inline-error" role="alert">{error}</p>}
          <StudyActivityDashboard />
          {!categories.length ? (
            <section className="empty-state category-empty"><span className="empty-mark"><Layers size={22} /></span><h2>No categories yet</h2><p>Create one to start organizing workspaces.</p></section>
          ) : (
            <div className="category-list">
              {categories.map((category) => {
                const categoryWorkspaces = workspaces.filter((workspace) => workspace.categoryId === category.id);
                const systemCategory = category.title.toLowerCase() === "uncategorized";
                return <section id={`category-section-${category.id}`} className={systemCategory ? "category-card category-card-system" : "category-card"} key={category.id} aria-labelledby={`category-${category.id}`}>
                  <div className="category-card-header">
                    <div className="category-title"><span className="category-mark"><Layers size={16} /></span><div>{editingCategoryId === category.id ? <input className="inline-dashboard-input category-name-input" aria-label="Category title" autoFocus autoComplete="off" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void commitCategoryRename()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitCategoryRename(); } if (event.key === "Escape") { categoryRenameCancelled.current = true; setTitle(category.title); setEditingCategoryId(null); } }} /> : <h2 id={`category-${category.id}`}>{category.title}</h2>}<p>{categoryWorkspaces.length} workspace{categoryWorkspaces.length === 1 ? "" : "s"} <span className="category-dot">·</span> updated {editedAt(category.updatedAt)}</p></div></div>
                    <div className="category-actions">{deletingCategoryId === category.id ? <span className="inline-confirm"><span>Delete?</span><button className="text-button" onClick={() => setDeletingCategoryId(null)}>Keep</button><button className="text-button danger-text" disabled={busy} onClick={() => void removeCategory(category)}>Delete</button></span> : <><button className="secondary compact-action" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={15} /> New workspace</button>{editingCategoryId !== category.id && <button className="icon-button" aria-label={`Rename ${category.title}`} title="Rename category" onClick={() => beginCategoryRename(category)}><Pencil size={15} /></button>}{category.id !== "legacy" && <button className="icon-button danger-icon" aria-label={`Delete ${category.title}`} title="Delete category" onClick={() => setDeletingCategoryId(category.id)}><Trash2 size={15} /></button>}</>}</div>
                  </div>
                  {createTarget?.kind === "workspace" && createTarget.category.id === category.id && <form className="quick-create workspace-quick-create" onSubmit={create}><input aria-label="Workspace title" autoFocus autoComplete="off" placeholder="Workspace name" maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreateTarget(null); }} /><button className="primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add"}</button><button type="button" className="icon-button" aria-label="Cancel new workspace" onClick={() => setCreateTarget(null)}><span aria-hidden="true">×</span></button>{error && <span className="quick-create-error" role="alert">{error}</span>}</form>}
                  <div className="workspace-list">
                    {categoryWorkspaces.map((workspace) => <div className="workspace-row" key={workspace.id}>
                      {editingWorkspaceId === workspace.id ? <input className="inline-dashboard-input workspace-name-input" aria-label="Workspace title" autoFocus autoComplete="off" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void commitWorkspaceRename()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitWorkspaceRename(); } if (event.key === "Escape") { workspaceRenameCancelled.current = true; setTitle(workspace.title); setEditingWorkspaceId(null); } }} /> : <Link to="/projects/$projectId" params={{ projectId: workspace.id }} className="workspace-link"><span className="workspace-icon"><FileText size={16} /></span><span className="workspace-name">{workspace.title}</span><time dateTime={workspace.updatedAt}>Edited {editedAt(workspace.updatedAt)}</time></Link>}
                      <div className="workspace-row-actions">{deleting?.id === workspace.id ? <span className="inline-confirm"><span>Delete?</span><button className="text-button" onClick={() => setDeleting(null)}>Keep</button><button className="text-button danger-text" disabled={busy} onClick={() => void remove()}>Delete</button></span> : <>{editingWorkspaceId !== workspace.id && <button className="icon-button" aria-label={`Rename ${workspace.title}`} title="Rename workspace" onClick={() => beginWorkspaceRename(workspace)}><Pencil size={15} /></button>}<details className="workspace-menu"><summary className="icon-button" aria-label={`Actions for ${workspace.title}`} title="Workspace actions"><MoreHorizontal size={17} /></summary><div className="workspace-menu-popover workspace-menu-right"><button className="menu-item menu-item-danger" onClick={() => { setError(""); setDeleting(workspace); }}><Trash2 size={14} /> Delete workspace</button></div></details></>}</div>
                    </div>)}
                    {!categoryWorkspaces.length && <button className="workspace-empty" onClick={() => beginCreate({ kind: "workspace", category })}><Plus size={15} /> Create the first workspace in this category</button>}
                  </div>
                </section>;
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
