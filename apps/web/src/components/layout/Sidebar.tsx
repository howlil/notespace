import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { FilePlus2, FileText, Folder, FolderOpen, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, IconButton, Input, cn } from "../ui";
import { useToast } from "../../providers/toast-provider";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { createCategory, createProject, deleteCategory, deleteProject, listCategoryWorkspaces, moveProject, renameProject, updateCategory } from "../../domain/project/api";
import "./sidebar.css";

export function Brand() {
  return <span className="brand"><span className="brand-mark">n<span>·</span></span>notespace<span className="brand-dot">.</span></span>;
}

type Props = { categories: CategorySummary[]; selectedCategoryId?: string; collapsed: boolean; onToggle: () => void; onSelectCategory: (categoryId: string) => void; onChanged?: () => void };
type DeleteTarget = { kind: "category"; item: CategorySummary } | { kind: "workspace"; item: ProjectSummary };

export function Sidebar({ categories, selectedCategoryId, collapsed, onToggle, onSelectCategory, onChanged }: Props) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, ProjectSummary[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ kind: "category" | "workspace"; categoryId?: string } | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [title, setTitle] = useState("");
  const uncategorized = categories.find((category) => category.id === "legacy") ?? categories.find((category) => category.title.toLowerCase() === "uncategorized");

  async function toggleCategory(category: CategorySummary) {
    const next = new Set(expanded);
    if (next.has(category.id)) {
      next.delete(category.id);
      setExpanded(next);
      return;
    }
    next.add(category.id);
    setExpanded(next);
    onSelectCategory(category.id);
    if (children[category.id]) return;
    setLoading(category.id);
    try {
      const page = await listCategoryWorkspaces(category.id, { limit: 5 });
      setChildren((current) => ({ ...current, [category.id]: page.items }));
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load workspaces." });
    } finally {
      setLoading(null);
    }
  }

  function startCreate(kind: "category" | "workspace", categoryId?: string) {
    setTitle("");
    setCreating({ kind, categoryId });
    if (categoryId) setExpanded((current) => new Set(current).add(categoryId));
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!creating || !next) return;
    try {
      const target = creating;
      if (target.kind === "category") await createCategory(next);
      else await createProject(next, target.categoryId);
      setTitle("");
      setCreating(null);
      onChanged?.();
      if (target.kind === "workspace" && target.categoryId) {
        const page = await listCategoryWorkspaces(target.categoryId, { limit: 5 });
        setChildren((current) => ({ ...current, [target.categoryId!]: page.items }));
        setExpanded((current) => new Set(current).add(target.categoryId!));
      }
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not create this item." });
    }
  }

  async function saveCategory(category: CategorySummary, value: string) {
    if (!value.trim() || value.trim() === category.title) {
      setEditingCategory(null);
      return;
    }
    try {
      await updateCategory(category.id, value.trim());
      setEditingCategory(null);
      onChanged?.();
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not rename category." });
    }
  }

  async function saveWorkspace(workspace: ProjectSummary, value: string) {
    if (!value.trim() || value.trim() === workspace.title) {
      setEditingWorkspace(null);
      return;
    }
    try {
      await renameProject(workspace.id, value.trim());
      setEditingWorkspace(null);
      onChanged?.();
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not rename workspace." });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      if (target.kind === "category") {
        await deleteCategory(target.item.id);
        setChildren((current) => {
          const next = { ...current };
          delete next[target.item.id];
          return next;
        });
      } else {
        await deleteProject(target.item.id);
        setChildren((current) => Object.fromEntries(
          Object.entries(current).map(([categoryId, workspaces]) => [
            categoryId,
            workspaces.filter((workspace) => workspace.id !== target.item.id),
          ]),
        ));
      }
      onChanged?.();
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : target.kind === "category" ? "Delete the workspaces in this category first." : "Could not delete workspace." });
    }
  }

  async function dropWorkspace(categoryId: string, event: React.DragEvent) {
    event.preventDefault();
    const workspaceId = event.dataTransfer.getData("text/notespace-workspace");
    if (!workspaceId) return;
    try {
      await moveProject(workspaceId, categoryId);
      setChildren({});
      onChanged?.();
    } catch (err) {
      showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not move workspace." });
    }
  }

  const inlineCreate = (kind: "category" | "workspace", categoryId?: string) => (
    <form data-category-id={categoryId} className="sidebar-inline-create" onSubmit={submitCreate} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
      <Input autoFocus aria-label={kind === "category" ? "Category title" : "Workspace title"} placeholder={kind === "category" ? "Category name" : "Workspace name"} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreating(null); }} />
      <IconButton type="button" aria-label={`Cancel new ${kind}`} onClick={() => setCreating(null)}><span aria-hidden="true">×</span></IconButton>
    </form>
  );

  function clearTransientState() {
    setCreating(null);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") clearTransientState();
  }

  function handleTriggerContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    clearTransientState();
  }

  return <>
    <aside className={cn("sidebar overflow-hidden", collapsed && "is-collapsed")}>
      <div className="sidebar-brand-row">
        {!collapsed && <Link to="/" className="brand-link" aria-label="Notespace home"><Brand /></Link>}
        <IconButton className="sidebar-toggle" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</IconButton>
      </div>
      {!collapsed && <>
        <div className="sidebar-create-tools" aria-label="Library actions">
          <IconButton className="sidebar-tool" aria-label="New category" title="New category" onClick={() => startCreate("category")}><FolderPlus size={16} /></IconButton>
          <IconButton className="sidebar-tool" aria-label="New workspace" title={uncategorized ? "New workspace in Uncategorized" : "New workspace"} onClick={() => startCreate("workspace", uncategorized?.id)}><FilePlus2 size={16} /></IconButton>
        </div>
        <AnimatePresence initial={false}>
          {creating?.kind === "category" && <motion.div key="category-create" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("category")}</motion.div>}
        </AnimatePresence>
        <nav aria-label="Categories" className="library-tree">
          {categories.map((category) => {
            const isOpen = expanded.has(category.id);
            const items = children[category.id] ?? [];
            const isSystemCategory = category.id === "legacy";
            return <div className={isSystemCategory ? "tree-category is-system-category" : "tree-category"} key={category.id} data-system-category={isSystemCategory ? "true" : undefined} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropWorkspace(category.id, event)}>
              <ContextMenu onOpenChange={(open) => { if (open) clearTransientState(); }}>
                <ContextMenuTrigger asChild>
                  <div className={selectedCategoryId === category.id ? "tree-row is-selected" : "tree-row"} onContextMenu={handleTriggerContextMenu} onKeyDown={handleTriggerKeyDown}>
                    <IconButton className="tree-expander" aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} onClick={() => void toggleCategory(category)}>{isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}</IconButton>
                    {editingCategory === category.id && !isSystemCategory ? <Input className="tree-inline-input" autoFocus defaultValue={category.title} aria-label="Category title" onBlur={(event) => void saveCategory(category, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCategory(category, event.currentTarget.value); if (event.key === "Escape") setEditingCategory(null); }} /> : <button className="tree-label" onClick={() => { onSelectCategory(category.id); if (!isOpen) void toggleCategory(category); }} onDoubleClick={() => { if (!isSystemCategory) setEditingCategory(category.id); }}><span>{category.title}</span><small>{isSystemCategory ? "Default" : category.workspaceCount}</small></button>}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => startCreate("workspace", category.id)}><Plus size={13} /> New workspace</ContextMenuItem>
                  {!isSystemCategory && <ContextMenuItem className="text-[var(--danger)]" onSelect={() => setDeleting({ kind: "category", item: category })}><Trash2 size={13} /> Delete</ContextMenuItem>}
                </ContextMenuContent>
              </ContextMenu>
              {isOpen && <div className="tree-children">
                {loading === category.id && <span className="tree-loading">Loading…</span>}
                <AnimatePresence initial={false}>
                  {creating?.kind === "workspace" && creating.categoryId === category.id && <motion.div key={`workspace-create-${category.id}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("workspace", category.id)}</motion.div>}
                </AnimatePresence>
                {items.map((workspace) => <ContextMenu key={workspace.id} onOpenChange={(open) => { if (open) clearTransientState(); }}>
                  <ContextMenuTrigger asChild>
                    <div className="tree-workspace" draggable tabIndex={0} onDragStart={(event) => event.dataTransfer.setData("text/notespace-workspace", workspace.id)} onContextMenu={handleTriggerContextMenu} onKeyDown={handleTriggerKeyDown}>
                      {editingWorkspace === workspace.id ? <Input className="tree-inline-input" autoFocus defaultValue={workspace.title} aria-label="Workspace title" onBlur={(event) => void saveWorkspace(workspace, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveWorkspace(workspace, event.currentTarget.value); if (event.key === "Escape") setEditingWorkspace(null); }} /> : <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} onDoubleClick={(event) => { event.preventDefault(); setEditingWorkspace(workspace.id); }}><FileText size={14} /><span>{workspace.title}</span></Link>}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent><ContextMenuItem className="text-[var(--danger)]" onSelect={() => setDeleting({ kind: "workspace", item: workspace })}><Trash2 size={13} /> Delete</ContextMenuItem></ContextMenuContent>
                </ContextMenu>)}
                {items.length >= 5 && <Link className="tree-view-all" to="/categories/$categoryId" params={{ categoryId: category.id }}>View all</Link>}
                {!loading && !items.length && !creating && <Button type="button" variant="ghost" size="sm" className="tree-empty" onClick={() => startCreate("workspace", category.id)}>+ New workspace</Button>}
              </div>}
            </div>;
          })}
        </nav>
      </>}
    </aside>
    <ConfirmDialog open={!!deleting} title={deleting?.kind === "category" ? "Delete this category?" : "Delete this workspace?"} description={deleting ? `“${deleting.item.title}” will be removed.` : ""} confirmLabel="Delete" onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={() => void confirmDelete()} />
  </>;
}
