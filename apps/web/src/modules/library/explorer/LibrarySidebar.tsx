import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, FileText, Folder, FolderOpen, LoaderCircle, Pencil, Plus, Trash2, MoveRight } from "lucide-react";
import { ConfirmDialog } from "../../../shared/ui/overlays/confirm-dialog";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, IconButton, Input, Skeleton, cn } from "../../../shared/ui";
import { useLibraryNavigation, type LibraryChange } from "./use-library-navigation";
import type { CategorySummary, WorkspaceSummary } from "../../../entities/workspace";

type Props = { categories: CategorySummary[]; selectedCategoryId?: string; activeWorkspace?: WorkspaceSummary; onSelectCategory: (categoryId: string) => void; onChanged?: (change?: LibraryChange) => void; onBeforeDeleteWorkspace?: (workspaceId: string) => Promise<boolean | number> };

function isExplorerToggle(target: EventTarget | null) {
  return target instanceof Element && target.matches('[data-explorer-toggle], [aria-label="Close Explorer"]');
}

const inlineInputClass = "min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0.5 py-1 text-[13px] leading-snug focus:border-transparent";

export function LibrarySidebar({ categories, selectedCategoryId, activeWorkspace, onSelectCategory, onChanged, onBeforeDeleteWorkspace }: Props) {
  const activeWorkspaceId = activeWorkspace?.id;
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const {
    children,
    categoryErrors,
    creating,
    createLoading,
    deleting,
    editingCategory,
    editingWorkspace,
    savingCategoryId,
    savingWorkspaceId,
    expanded,
    loading,
    hasMore,
    title,
    confirmDelete,
    moveWorkspaceToCategory,
    saveCategory,
    saveWorkspace,
    setCreating,
    setDeleting,
    setEditingCategory,
    setEditingWorkspace,
    setTitle,
    startCreate,
    submitCreate,
    toggleCategory,
    retryCategory,
  } = useLibraryNavigation({ categories, selectedCategoryId, onChanged, onBeforeDeleteWorkspace });

  function dropWorkspace(categoryId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverCategoryId(null);
    const workspaceId = event.dataTransfer.getData("text/notespace-workspace");
    if (workspaceId) void moveWorkspaceToCategory(categoryId, workspaceId);
  }

  const inlineCreate = (kind: "category" | "workspace", categoryId?: string) => (
    <form data-category-id={categoryId} aria-busy={createLoading} className="my-0.5 flex min-w-0 items-center gap-0.5 rounded-md bg-ink/[0.04] px-1.5 py-0.5 ring-1 ring-inset ring-line/80" onSubmit={(event) => { event.preventDefault(); void submitCreate(); }}>
      <Input className={cn(inlineInputClass, "w-px")} autoFocus disabled={createLoading} aria-label={kind === "category" ? "Category title" : "Workspace title"} placeholder={kind === "category" ? "Category name" : "Workspace name"} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); clearTransientState(); } }} />
      <IconButton type="submit" size="xs" disabled={createLoading || !title.trim()} className="size-5 shrink-0 text-muted hover:text-ink" aria-label={`Create ${kind}`} title={`Create ${kind}`}>
        {createLoading ? <LoaderCircle size={12} className="animate-spin" /> : <Check size={12} />}
      </IconButton>
      <IconButton type="button" size="xs" disabled={createLoading} className="size-5 shrink-0 text-muted hover:text-ink" aria-label={`Cancel new ${kind}`} title={`Cancel new ${kind}`} onClick={() => setCreating(null)}><span aria-hidden="true">×</span></IconButton>
    </form>
  );

  function clearTransientState() { if (!createLoading) setCreating(null); }
  function handleTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) { if (event.key === "Escape") clearTransientState(); }
  function handleTriggerContextMenu(event: MouseEvent<HTMLDivElement>) { event.stopPropagation(); clearTransientState(); }

  return <>
    <aside className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden bg-sidebar px-1.5 py-1.5 select-none" aria-label="Category explorer">
      <div className="flex min-h-7 shrink-0 items-center justify-between px-1.5">
        <span className="text-[12px] font-medium text-muted">Categories</span>
        <IconButton type="button" variant="ghost" size="xs" className="text-muted hover:text-ink" aria-label="New category" title="New category" disabled={createLoading}
          onClick={() => startCreate("category")}><Plus size={13} aria-hidden="true" /></IconButton>
      </div>
      <AnimatePresence initial={false}>
        {creating?.kind === "category" && <motion.div key="category-create" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden px-0.5">{inlineCreate("category")}</motion.div>}
        {creating?.kind === "workspace" && !categories.some(item => item.id === creating.categoryId) && <motion.div key="workspace-create-top" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden px-0.5">{inlineCreate("workspace")}</motion.div>}
      </AnimatePresence>
      <nav aria-label="Categories" className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-px overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar max-[560px]:min-h-0">
        {categories.map((category) => {
          const isOpen = expanded.has(category.id);
          const preview = (children[category.id] ?? []).map((item) =>
            activeWorkspace && item.id === activeWorkspace.id && activeWorkspace.version >= item.version
              ? { ...item, ...activeWorkspace }
              : item,
          );
          const items = activeWorkspace?.categoryId === category.id && !preview.some((item) => item.id === activeWorkspaceId)
            ? [activeWorkspace, ...preview] : preview;
          const isSystemCategory = category.id === "legacy";
          const isDragOver = dragOverCategoryId === category.id;
          return (
            <div
              className={cn("group/tree relative rounded-md transition-colors", isDragOver && "bg-tint/70 ring-1 ring-inset ring-accent/40")}
              key={category.id}
              data-system-category={isSystemCategory ? "true" : undefined}
              onDragOver={(event) => { event.preventDefault(); if (dragOverCategoryId !== category.id) setDragOverCategoryId(category.id); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverCategoryId((current) => (current === category.id ? null : current)); }}
              onDrop={(event) => void dropWorkspace(category.id, event)}
            >
              <ContextMenu onOpenChange={(open) => { if (open) clearTransientState(); }}>
                <ContextMenuTrigger asChild>
                  <div
                    className="group relative flex min-h-[26px] min-w-0 items-center rounded-md text-ink/90 transition-colors duration-100 hover:bg-ink/[0.06] hover:text-ink"
                    onContextMenu={handleTriggerContextMenu}
                    onKeyDown={(event) => {
                      handleTriggerKeyDown(event);
                      if (event.key === "F2" && !isSystemCategory) { event.preventDefault(); setEditingCategory(category.id); }
                    }}
                  >
                    <IconButton className="grid h-[26px] w-5 shrink-0 place-items-center rounded-none text-muted/80 transition-colors hover:!bg-transparent hover:!text-ink group-hover:text-ink/80" aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} title={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} onClick={() => void toggleCategory(category)}>
                      <ChevronRight size={12} className={cn("transition-transform duration-150 ease-out", isOpen && "rotate-90")} />
                    </IconButton>
                    {editingCategory === category.id && !isSystemCategory ? (
                      <Input className={inlineInputClass} autoFocus disabled={savingCategoryId === category.id} aria-busy={savingCategoryId === category.id} defaultValue={category.title} aria-label="Category title" onBlur={(event) => { if (!isExplorerToggle(event.relatedTarget)) void saveCategory(category, event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void saveCategory(category, event.currentTarget.value); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = category.title; setEditingCategory(null); } }} />
                    ) : (
                      <Button variant="ghost" size="sm" className={cn("!min-h-0 min-w-0 flex-1 justify-start gap-1.5 rounded-none border-0 py-1 pl-0.5 pr-1.5 text-left text-[13px] font-medium text-inherit hover:!bg-transparent hover:!text-inherit", isSystemCategory && "font-normal text-ink/80")} aria-label={category.title} aria-expanded={isOpen} onClick={() => void toggleCategory(category)}>
                        {isOpen ? <FolderOpen size={13} className="shrink-0 text-muted/80 group-hover:text-ink/80" aria-hidden="true" /> : <Folder size={13} className="shrink-0 text-muted/80 group-hover:text-ink/80" aria-hidden="true" />}
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{category.title}</span>
                        <small className="ml-auto shrink-0 text-[11px] font-normal tabular-nums text-muted/80 transition-opacity duration-100 group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-0">{isSystemCategory ? "Default" : category.workspaceCount}</small>
                      </Button>
                    )}
                    <IconButton type="button" size="xs" className="size-5 absolute right-1 top-1/2 -translate-y-1/2 text-muted opacity-0 transition-opacity duration-100 hover:bg-ink/10 hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      aria-label={`New workspace in ${category.title}`} title={`New workspace in ${category.title}`} disabled={createLoading}
                      onClick={() => startCreate("workspace", category.id)}><Plus size={12} /></IconButton>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => onSelectCategory(category.id)}><Folder size={13} /> View category</ContextMenuItem>
                  <ContextMenuItem onSelect={() => startCreate("workspace", category.id)}><Plus size={13} /> New workspace</ContextMenuItem>
                  {!isSystemCategory && <ContextMenuItem onSelect={() => setEditingCategory(category.id)}><Pencil size={13} /> Rename category</ContextMenuItem>}
                  {!isSystemCategory && <ContextMenuItem className="text-danger" onSelect={() => setDeleting({ kind: "category", item: category })}><Trash2 size={13} /> Delete</ContextMenuItem>}
                </ContextMenuContent>
              </ContextMenu>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key={`category-contents-${category.id}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="ml-[10px] grid gap-px border-l border-line/80 py-0.5 pl-2.5 transition-colors group-hover/tree:border-ink/20">
                      {loading.has(category.id) && !children[category.id] && <div className="grid gap-1.5 px-1.5 py-1.5" role="status" aria-label={`Loading ${category.title}`}><span className="sr-only">Loading {category.title}…</span><Skeleton className="h-2 w-[min(76%,130px)]" /><Skeleton className="h-2 w-[min(52%,90px)] opacity-70" /></div>}
                      <AnimatePresence initial={false}>
                        {creating?.kind === "workspace" && creating.categoryId === category.id && <motion.div key={`workspace-create-${category.id}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("workspace", category.id)}</motion.div>}
                      </AnimatePresence>
                      {items.map((workspace) => {
                        const isActive = activeWorkspaceId === workspace.id;
                        return (
                          <ContextMenu key={workspace.id} onOpenChange={(open) => { if (open) clearTransientState(); }}>
                            <ContextMenuTrigger asChild>
                              <div className={cn("group relative flex min-h-[26px] min-w-0 items-center rounded-md text-ink/85 transition-colors duration-100 hover:bg-ink/[0.06] hover:text-ink", isActive && "font-medium text-accent hover:bg-transparent hover:text-accent")} draggable tabIndex={0} onDragStart={(event) => event.dataTransfer.setData("text/notespace-workspace", workspace.id)} onContextMenu={handleTriggerContextMenu} onKeyDown={(event) => {
                                  handleTriggerKeyDown(event);
                                  if (event.key === "F2") { event.preventDefault(); setEditingWorkspace(workspace.id); }
                                }}>
                                {isActive && <motion.span layoutId="notespace-active-workspace" className="pointer-events-none absolute inset-0 rounded-md bg-tint" transition={{ type: "spring", stiffness: 480, damping: 42 }} aria-hidden="true" />}
                                {editingWorkspace === workspace.id ? (
                                  <Input className={cn(inlineInputClass, "relative z-10 px-1.5")} autoFocus disabled={savingWorkspaceId === workspace.id} aria-busy={savingWorkspaceId === workspace.id} defaultValue={workspace.title} aria-label="Workspace title" onBlur={(event) => { if (!isExplorerToggle(event.relatedTarget)) void saveWorkspace(workspace, event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void saveWorkspace(workspace, event.currentTarget.value); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = workspace.title; setEditingWorkspace(null); } }} />
                                ) : (
                                  <Link className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-[13px] leading-snug text-inherit hover:text-inherit" to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} search={{ noteId: undefined }} aria-current={isActive ? "page" : undefined} onClick={(event) => { if (event.detail >= 2) event.preventDefault(); }} onDoubleClick={(event) => { event.preventDefault(); setEditingWorkspace(workspace.id); }}>
                                    <FileText size={13} className={cn("shrink-0 transition-colors", isActive ? "text-accent" : "text-muted/80 group-hover:text-ink/80")} aria-hidden="true" />
                                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{workspace.title}</span>
                                  </Link>
                                )}
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onSelect={() => setEditingWorkspace(workspace.id)}><Pencil size={13} /> Rename workspace</ContextMenuItem>
                              <ContextMenuSub>
                                <ContextMenuSubTrigger><MoveRight size={13} /> Move to category</ContextMenuSubTrigger>
                                <ContextMenuSubContent>
                                  {categories.filter((target) => target.id !== category.id).map((target) => (
                                    <ContextMenuItem key={target.id} onSelect={() => void moveWorkspaceToCategory(target.id, workspace.id)}>{target.title}</ContextMenuItem>
                                  ))}
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              <ContextMenuItem className="text-danger" onSelect={() => setDeleting({ kind: "workspace", item: workspace })}><Trash2 size={13} /> Delete</ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                      {categoryErrors.has(category.id) && <div role="alert" className="px-1.5 py-1 text-[11px] text-danger">Could not load Workspaces. <Button type="button" size="sm" variant="ghost" onClick={() => void retryCategory(category.id)}>Retry</Button></div>}
                      {hasMore(category.id) && <Button type="button" variant="ghost" size="xs" className="w-auto justify-start px-1.5 py-0.5 text-muted hover:text-accent" onClick={() => onSelectCategory(category.id)}>View all</Button>}
                      {!loading.has(category.id) && !categoryErrors.has(category.id) && !items.length && !creating && <Button type="button" variant="ghost" size="xs" className="w-auto justify-start px-1.5 py-0.5 text-muted hover:text-accent" onClick={() => startCreate("workspace", category.id)}>+ New workspace</Button>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>
    </aside>
    <ConfirmDialog open={!!deleting} title={deleting?.kind === "category" ? "Delete this category?" : "Delete this workspace?"} description={deleting ? `“${deleting.item.title}” will be removed.` : ""} confirmLabel="Delete" onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={() => void confirmDelete()} />
  </>;
}
