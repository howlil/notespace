import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { FilePlus2, FileText, Folder, FolderOpen, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, IconButton, Input, cn } from "../ui";
import { useToast } from "../../providers/toast-provider";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";
import { createCategory, createProject, deleteCategory, deleteProject, listCategoryWorkspaces, moveProject, renameProject, updateCategory } from "../../domain/project/api";

export function Brand() {
  return (
    <span className="flex items-center text-lg font-semibold tracking-[-.7px] text-ink">
      <span className="mr-2 inline-block size-6 rounded-[7px] bg-ink text-center text-xl font-medium leading-[22px] tracking-[-3px] text-surface">n<span className="text-accent">·</span></span>
      notespace<span className="text-accent">.</span>
    </span>
  );
}

type Props = { categories: CategorySummary[]; selectedCategoryId?: string; collapsed: boolean; onToggle: () => void; onSelectCategory: (categoryId: string) => void; onChanged?: () => void };
type DeleteTarget = { kind: "category"; item: CategorySummary } | { kind: "workspace"; item: ProjectSummary };

const inlineInputClass = "min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0.5 py-[5px] text-[10px] focus:border-transparent";

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
    <form data-category-id={categoryId} className="mx-[5px] mt-[3px] mb-[5px] flex w-[calc(100%_-_14px)] min-w-0 items-center gap-[3px]" onSubmit={submitCreate} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
      <Input className={cn(inlineInputClass, "w-px")} autoFocus aria-label={kind === "category" ? "Category title" : "Workspace title"} placeholder={kind === "category" ? "Category name" : "Workspace name"} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreating(null); }} />
      <IconButton type="button" className="size-6 shrink-0" aria-label={`Cancel new ${kind}`} onClick={() => setCreating(null)}><span aria-hidden="true">×</span></IconButton>
    </form>
  );

  function clearTransientState() { setCreating(null); }
  function handleTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) { if (event.key === "Escape") clearTransientState(); }
  function handleTriggerContextMenu(event: MouseEvent<HTMLDivElement>) { event.stopPropagation(); clearTransientState(); }

  return <>
    <aside className={cn(
      "sticky top-0 flex h-dvh min-w-0 flex-col gap-1.5 overflow-hidden border-r border-line bg-sidebar px-3 py-3.5 max-[480px]:relative max-[480px]:h-auto max-[480px]:max-h-[190px] max-[480px]:w-full max-[480px]:border-r-0 max-[480px]:border-b max-[480px]:px-4 max-[480px]:pt-3 max-[480px]:pb-2.5",
      collapsed && "items-center px-2 max-[480px]:px-4",
    )}>
      <div className={cn("flex min-h-8 items-center justify-between gap-2 border-b border-line px-0.5 pb-2.5 max-[480px]:shrink-0", collapsed && "w-full justify-center px-0")}>
        {!collapsed && <Link to="/" className="min-w-0" aria-label="Notespace home"><Brand /></Link>}
        <IconButton className="m-0 shrink-0" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</IconButton>
      </div>
      {!collapsed && <>
        <div className="flex items-center gap-[3px] border-b border-line py-2 max-[480px]:mb-[3px]" aria-label="Library actions">
          <IconButton className="size-[30px] text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent" aria-label="New category" title="New category" onClick={() => startCreate("category")}><FolderPlus size={16} /></IconButton>
          <IconButton className="size-[30px] text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent" aria-label="New workspace" title={uncategorized ? "New workspace in Uncategorized" : "New workspace"} onClick={() => startCreate("workspace", uncategorized?.id)}><FilePlus2 size={16} /></IconButton>
        </div>
        <AnimatePresence initial={false}>
          {creating?.kind === "category" && <motion.div key="category-create" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("category")}</motion.div>}
        </AnimatePresence>
        <nav aria-label="Categories" className="grid min-w-0 flex-1 content-start gap-0.5 overflow-auto pt-0.5 max-[480px]:min-h-0">
          {categories.map((category) => {
            const isOpen = expanded.has(category.id);
            const items = children[category.id] ?? [];
            const isSystemCategory = category.id === "legacy";
            return (
              <div className="relative" key={category.id} data-system-category={isSystemCategory ? "true" : undefined} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropWorkspace(category.id, event)}>
                <ContextMenu onOpenChange={(open) => { if (open) clearTransientState(); }}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        "flex min-h-8 min-w-0 items-center rounded-md",
                        selectedCategoryId === category.id && "bg-tint",
                        isSystemCategory && "bg-[color-mix(in_srgb,var(--surface)_55%,transparent)]",
                      )}
                      onContextMenu={handleTriggerContextMenu}
                      onKeyDown={handleTriggerKeyDown}
                    >
                      <IconButton className="grid h-[30px] w-[27px] shrink-0 place-items-center rounded-none text-muted" aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} onClick={() => void toggleCategory(category)}>{isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}</IconButton>
                      {editingCategory === category.id && !isSystemCategory ? (
                        <Input className={inlineInputClass} autoFocus defaultValue={category.title} aria-label="Category title" onBlur={(event) => void saveCategory(category, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCategory(category, event.currentTarget.value); if (event.key === "Escape") setEditingCategory(null); }} />
                      ) : (
                        <button className={cn("flex min-w-0 flex-1 items-center gap-[7px] border-0 bg-transparent px-[3px] py-1.5 text-left text-[11px] text-ink hover:text-accent", isSystemCategory && "text-muted")} onClick={() => { onSelectCategory(category.id); if (!isOpen) void toggleCategory(category); }} onDoubleClick={() => { if (!isSystemCategory) setEditingCategory(category.id); }}>
                          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{category.title}</span>
                          <small className={cn("ml-auto text-[9px] text-muted", isSystemCategory && "tracking-[.2px]")}>{isSystemCategory ? "Default" : category.workspaceCount}</small>
                        </button>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => startCreate("workspace", category.id)}><Plus size={13} /> New workspace</ContextMenuItem>
                    {!isSystemCategory && <ContextMenuItem className="text-danger" onSelect={() => setDeleting({ kind: "category", item: category })}><Trash2 size={13} /> Delete</ContextMenuItem>}
                  </ContextMenuContent>
                </ContextMenu>
                {isOpen && (
                  <div className="ml-[27px] grid gap-px border-l border-line pt-0.5 pb-1">
                    {loading === category.id && <span className="mx-[5px] mt-0.5 ml-[9px] px-[3px] py-[5px] text-[9px] text-accent">Loading…</span>}
                    <AnimatePresence initial={false}>
                      {creating?.kind === "workspace" && creating.categoryId === category.id && <motion.div key={`workspace-create-${category.id}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("workspace", category.id)}</motion.div>}
                    </AnimatePresence>
                    {items.map((workspace) => (
                      <ContextMenu key={workspace.id} onOpenChange={(open) => { if (open) clearTransientState(); }}>
                        <ContextMenuTrigger asChild>
                          <div className="flex min-h-7 min-w-0 items-center gap-0.5 pl-[9px]" draggable tabIndex={0} onDragStart={(event) => event.dataTransfer.setData("text/notespace-workspace", workspace.id)} onContextMenu={handleTriggerContextMenu} onKeyDown={handleTriggerKeyDown}>
                            {editingWorkspace === workspace.id ? (
                              <Input className={inlineInputClass} autoFocus defaultValue={workspace.title} aria-label="Workspace title" onBlur={(event) => void saveWorkspace(workspace, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveWorkspace(workspace, event.currentTarget.value); if (event.key === "Escape") setEditingWorkspace(null); }} />
                            ) : (
                              <Link className="flex min-w-0 flex-1 items-center gap-[7px] px-[3px] py-[5px] text-[10px] text-muted hover:text-accent" to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} onDoubleClick={(event) => { event.preventDefault(); setEditingWorkspace(workspace.id); }}><FileText size={14} /><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{workspace.title}</span></Link>
                            )}
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent><ContextMenuItem className="text-danger" onSelect={() => setDeleting({ kind: "workspace", item: workspace })}><Trash2 size={13} /> Delete</ContextMenuItem></ContextMenuContent>
                      </ContextMenu>
                    ))}
                    {items.length >= 5 && <Link className="mx-[5px] mt-0.5 ml-[9px] px-[3px] py-[5px] text-[9px] text-accent" to="/categories/$categoryId" params={{ categoryId: category.id }}>View all</Link>}
                    {!loading && !items.length && !creating && <Button type="button" variant="ghost" size="sm" className="mx-[5px] mt-0.5 ml-[9px] w-auto justify-start px-[3px] py-[5px] text-[9px] text-accent" onClick={() => startCreate("workspace", category.id)}>+ New workspace</Button>}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </>}
    </aside>
    <ConfirmDialog open={!!deleting} title={deleting?.kind === "category" ? "Delete this category?" : "Delete this workspace?"} description={deleting ? `“${deleting.item.title}” will be removed.` : ""} confirmLabel="Delete" onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={() => void confirmDelete()} />
  </>;
}
