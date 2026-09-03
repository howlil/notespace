import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from "lucide-react";
import type { CategorySummary, ProjectSummary } from "../domain/project/project";
import { createCategory, createProject, deleteCategory, deleteProject, listCategoryWorkspaces, moveProject, renameProject, updateCategory } from "../domain/project/api";

export function Brand() { return <span className="brand"><span className="brand-mark">n<span>·</span></span>notespace<span className="brand-dot">.</span></span>; }

type Props = { categories: CategorySummary[]; selectedCategoryId?: string; collapsed: boolean; onToggle: () => void; onSelectCategory: (categoryId: string) => void; onChanged?: () => void };

export function Sidebar({ categories, selectedCategoryId, collapsed, onToggle, onSelectCategory, onChanged }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, ProjectSummary[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ kind: "category" | "workspace"; categoryId?: string } | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function toggleCategory(category: CategorySummary) {
    const next = new Set(expanded);
    if (next.has(category.id)) { next.delete(category.id); setExpanded(next); return; }
    next.add(category.id); setExpanded(next); onSelectCategory(category.id);
    if (children[category.id]) return;
    setLoading(category.id); setError("");
    try { const page = await listCategoryWorkspaces(category.id, { limit: 5 }); setChildren((current) => ({ ...current, [category.id]: page.items })); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load workspaces."); }
    finally { setLoading(null); }
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault(); const next = title.trim(); if (!creating || !next) return; setError("");
    try {
      const target = creating;
      if (target.kind === "category") await createCategory(next);
      else if (target.categoryId) await createProject(next, target.categoryId);
      setTitle(""); setCreating(null); setMenu(null); onChanged?.();
      if (target.kind === "workspace" && target.categoryId) {
        const page = await listCategoryWorkspaces(target.categoryId, { limit: 5 });
        setChildren((current) => ({ ...current, [target.categoryId!]: page.items }));
        setExpanded((current) => new Set(current).add(target.categoryId!));
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create this item."); }
  }

  async function saveCategory(category: CategorySummary, value: string) { if (!value.trim() || value.trim() === category.title) { setEditingCategory(null); return; } try { await updateCategory(category.id, value.trim()); setEditingCategory(null); onChanged?.(); } catch (err) { setError(err instanceof Error ? err.message : "Could not rename category."); } }
  async function saveWorkspace(workspace: ProjectSummary, value: string) { if (!value.trim() || value.trim() === workspace.title) { setEditingWorkspace(null); return; } try { await renameProject(workspace.id, value.trim()); setEditingWorkspace(null); onChanged?.(); } catch (err) { setError(err instanceof Error ? err.message : "Could not rename workspace."); } }
  async function removeCategory(category: CategorySummary) { if (!window.confirm(`Delete “${category.title}”?`)) return; try { await deleteCategory(category.id); setMenu(null); onChanged?.(); } catch (err) { setError(err instanceof Error ? err.message : "Delete the workspaces in this category first."); } }
  async function removeWorkspace(workspace: ProjectSummary) { if (!window.confirm(`Delete “${workspace.title}”?`)) return; try { await deleteProject(workspace.id); setMenu(null); onChanged?.(); } catch (err) { setError(err instanceof Error ? err.message : "Could not delete workspace."); } }
  async function dropWorkspace(categoryId: string, event: React.DragEvent) { event.preventDefault(); const workspaceId = event.dataTransfer.getData("text/notespace-workspace"); if (!workspaceId) return; try { await moveProject(workspaceId, categoryId); setChildren({}); onChanged?.(); } catch (err) { setError(err instanceof Error ? err.message : "Could not move workspace."); } }

  // categoryId is kept for call-site clarity when rendering a category-scoped form.
  const inlineCreate = (kind: "category" | "workspace", categoryId?: string) => <form data-category-id={categoryId} className="sidebar-inline-create" onSubmit={submitCreate}><input autoFocus aria-label={kind === "category" ? "Category title" : "Workspace title"} placeholder={kind === "category" ? "Category name" : "Workspace name"} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreating(null); }} /><button aria-label={`Create ${kind}`} disabled={!title.trim()}><Plus size={14} /></button><button type="button" aria-label={`Cancel new ${kind}`} onClick={() => setCreating(null)}>×</button></form>;

  return <aside className={collapsed ? "sidebar is-collapsed" : "sidebar"}>
    <div className="sidebar-brand-row"><Link to="/" className="brand-link" aria-label="Notespace home"><Brand /></Link><button className="sidebar-toggle icon-button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
    {collapsed ? <button className="sidebar-collapsed-expand" onClick={onToggle} aria-label="Expand sidebar"><ChevronRight size={18} /></button> : <>
      <nav aria-label="Main navigation"><Link to="/" className="nav-item"><FolderOpen size={16} /> Library</Link></nav>
      <div className="sidebar-section-row"><span className="sidebar-section">LIBRARY</span><button className="icon-button" aria-label="New category" title="New category" onClick={() => { setCreating({ kind: "category" }); setTitle(""); }}><Plus size={15} /></button></div>
      {creating?.kind === "category" && inlineCreate("category")}
      <nav aria-label="Categories" className="library-tree">{categories.map((category) => { const isOpen = expanded.has(category.id); const items = children[category.id] ?? []; return <div className="tree-category" key={category.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropWorkspace(category.id, event)}>
        <div className={selectedCategoryId === category.id ? "tree-row is-selected" : "tree-row"}><button className="tree-expander" aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} onClick={() => void toggleCategory(category)}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>{editingCategory === category.id ? <input className="tree-inline-input" autoFocus defaultValue={category.title} aria-label="Category title" onBlur={(event) => void saveCategory(category, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCategory(category, event.currentTarget.value); if (event.key === "Escape") setEditingCategory(null); }} /> : <button className="tree-label" onClick={() => { onSelectCategory(category.id); if (!isOpen) void toggleCategory(category); }}><Folder size={15} /><span>{category.title}</span><small>{category.workspaceCount}</small></button>}<button className="icon-button tree-menu-trigger" aria-label={`Actions for ${category.title}`} onClick={() => setMenu(menu === `category:${category.id}` ? null : `category:${category.id}`)}><MoreHorizontal size={15} /></button></div>
        {menu === `category:${category.id}` && <div className="tree-menu"><button onClick={() => { setEditingCategory(category.id); setMenu(null); }}><Pencil size={13} /> Rename</button><button onClick={() => { setCreating({ kind: "workspace", categoryId: category.id }); setTitle(""); setMenu(null); setExpanded((current) => new Set(current).add(category.id)); }}><Plus size={13} /> New workspace</button><button className="danger-text" onClick={() => void removeCategory(category)}><Trash2 size={13} /> Delete</button></div>}
        {isOpen && <div className="tree-children">{loading === category.id && <span className="tree-loading">Loading…</span>}{creating?.kind === "workspace" && creating.categoryId === category.id && inlineCreate("workspace", category.id)}{items.map((workspace) => <div className="tree-workspace" key={workspace.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/notespace-workspace", workspace.id)}>{editingWorkspace === workspace.id ? <input className="tree-inline-input" autoFocus defaultValue={workspace.title} aria-label="Workspace title" onBlur={(event) => void saveWorkspace(workspace, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveWorkspace(workspace, event.currentTarget.value); if (event.key === "Escape") setEditingWorkspace(null); }} /> : <Link to="/projects/$projectId" params={{ projectId: workspace.id }}><FileText size={14} /><span>{workspace.title}</span></Link>}<button className="icon-button" aria-label={`Actions for ${workspace.title}`} onClick={() => setMenu(menu === `workspace:${workspace.id}` ? null : `workspace:${workspace.id}`)}><MoreHorizontal size={14} /></button>{menu === `workspace:${workspace.id}` && <div className="tree-menu tree-menu-workspace"><button onClick={() => { setEditingWorkspace(workspace.id); setMenu(null); }}><Pencil size={13} /> Rename</button><button className="danger-text" onClick={() => void removeWorkspace(workspace)}><Trash2 size={13} /> Delete</button></div>}</div>)}{items.length >= 5 && <Link className="tree-view-all" to="/categories/$categoryId" params={{ categoryId: category.id }}>View all</Link>}{!loading && !items.length && !creating && <button className="tree-empty" onClick={() => { setCreating({ kind: "workspace", categoryId: category.id }); setTitle(""); }}>+ New workspace</button>}</div>}
      </div>; })}</nav>
      {error && <p className="sidebar-error" role="alert">{error}</p>}
    </>}
  </aside>;
}
