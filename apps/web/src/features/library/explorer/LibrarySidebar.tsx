import { AnimatePresence, motion } from "motion/react";
import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, FileText, Folder, Layers, LoaderCircle, Pencil, Plus, Trash2, MoveRight } from "lucide-react";
import { ConfirmDialog } from "../../../shared/ui/overlays/confirm-dialog";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, IconButton, Input, Skeleton, cn } from "../../../shared/ui";
import { useLibraryNavigation, type LibraryChange } from "./use-library-navigation";
import type { CategorySummary, WorkspaceSummary } from "../../../domain/workspace/workspace";

type Props = { categories: CategorySummary[]; selectedCategoryId?: string; activeWorkspace?: WorkspaceSummary; onSelectCategory: (categoryId: string) => void; onChanged?: (change?: LibraryChange) => void; onBeforeDeleteWorkspace?: (workspaceId: string) => Promise<boolean> };

const inlineInputClass = "min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0.5 py-[5px] text-[11px] focus:border-transparent";

export function LibrarySidebar({ categories, selectedCategoryId, activeWorkspace, onSelectCategory, onChanged, onBeforeDeleteWorkspace }: Props) {
  const activeWorkspaceId = activeWorkspace?.id;
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
    uncategorized,
  } = useLibraryNavigation({ categories, selectedCategoryId, onChanged, onBeforeDeleteWorkspace });

  function dropWorkspace(categoryId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const workspaceId = event.dataTransfer.getData("text/notespace-workspace");
    if (workspaceId) void moveWorkspaceToCategory(categoryId, workspaceId);
  }

  const inlineCreate = (kind: "category" | "workspace", categoryId?: string) => (
    <form data-category-id={categoryId} aria-busy={createLoading} className="mx-1 my-1 flex min-w-0 items-center gap-1" onSubmit={(event) => { event.preventDefault(); void submitCreate(); }}>
      <Input className={cn(inlineInputClass, "w-px")} autoFocus disabled={createLoading} aria-label={kind === "category" ? "Category title" : "Workspace title"} placeholder={kind === "category" ? "Category name" : "Workspace name"} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); clearTransientState(); } }} />
      <IconButton type="submit" disabled={createLoading || !title.trim()} className="!size-6 shrink-0 text-ink/70" aria-label={`Create ${kind}`} title={`Create ${kind}`}>
        {createLoading ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
      </IconButton>
      <IconButton type="button" disabled={createLoading} className="!size-6 shrink-0 text-ink/70" aria-label={`Cancel new ${kind}`} title={`Cancel new ${kind}`} onClick={() => setCreating(null)}><span aria-hidden="true">×</span></IconButton>
    </form>
  );

  function clearTransientState() { if (!createLoading) setCreating(null); }
  function handleTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) { if (event.key === "Escape") clearTransientState(); }
  function handleTriggerContextMenu(event: MouseEvent<HTMLDivElement>) { event.stopPropagation(); clearTransientState(); }

  return <>
    <aside className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden bg-sidebar px-2 py-2" aria-label="Category explorer">
      <Link to="/" search={{}} aria-current={!activeWorkspaceId && !selectedCategoryId ? "page" : undefined}
        className="flex min-h-8 items-center gap-2 rounded-md px-2 text-[11px] text-ink transition-colors hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent">
        <Layers size={14} aria-hidden="true" /> All workspaces
      </Link>
      <Button type="button" size="sm" variant="secondary" className="mb-2 w-full justify-start gap-2 px-2" disabled={createLoading}
        aria-label="New workspace" onClick={() => startCreate("workspace", selectedCategoryId || uncategorized?.id)}>
        <Plus size={14} aria-hidden="true" /> New workspace
      </Button>
      <div className="flex min-h-8 shrink-0 items-center justify-between pl-2 pr-0">
        <span className="text-[11px] font-medium text-muted">Categories</span>
        <Button type="button" size="sm" variant="ghost" className="gap-1 px-1.5 text-[10px]" aria-label="New category" title="New category" disabled={createLoading}
          onClick={() => startCreate("category")}><Plus size={13} aria-hidden="true" /> New category</Button>
      </div>
      <AnimatePresence initial={false}>
        {creating?.kind === "category" && <motion.div key="category-create" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("category")}</motion.div>}
        {creating?.kind === "workspace" && !categories.some(item => item.id === creating.categoryId) && <motion.div key="workspace-create-top" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("workspace")}</motion.div>}
      </AnimatePresence>
      <nav aria-label="Categories" className="grid min-w-0 flex-1 content-start gap-0.5 overflow-auto pt-0.5 max-[560px]:min-h-0">
        {categories.map((category) => {
          const isOpen = expanded.has(category.id);
          const preview = children[category.id] ?? [];
          const items = activeWorkspace?.categoryId === category.id && !preview.some((item) => item.id === activeWorkspaceId)
            ? [activeWorkspace, ...preview] : preview;
          const isSystemCategory = category.id === "legacy";
          return (
            <div className="relative" key={category.id} data-system-category={isSystemCategory ? "true" : undefined} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropWorkspace(category.id, event)}>
              <ContextMenu onOpenChange={(open) => { if (open) clearTransientState(); }}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "group flex min-h-8 min-w-0 items-center rounded-md transition-colors hover:bg-tint hover:text-accent",
                      isSystemCategory && "bg-[color-mix(in_srgb,var(--surface)_55%,transparent)]",
                    )}
                    onContextMenu={handleTriggerContextMenu}
                    onKeyDown={(event) => {
                      handleTriggerKeyDown(event);
                      if (event.key === "F2" && !isSystemCategory) { event.preventDefault(); setEditingCategory(category.id); }
                    }}
                  >
                    <IconButton className="grid h-[30px] w-[27px] shrink-0 place-items-center rounded-none text-inherit hover:!bg-transparent hover:!text-inherit" aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} title={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} onClick={() => void toggleCategory(category)}><ChevronRight size={14} className={cn("transition-transform", isOpen && "rotate-90")} /></IconButton>
                    {editingCategory === category.id && !isSystemCategory ? (
                      <Input className={inlineInputClass} autoFocus disabled={savingCategoryId === category.id} aria-busy={savingCategoryId === category.id} defaultValue={category.title} aria-label="Category title" onBlur={(event) => void saveCategory(category, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void saveCategory(category, event.currentTarget.value); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = category.title; setEditingCategory(null); } }} />
                    ) : (
                      <Button variant="ghost" size="sm" className={cn("!min-h-0 min-w-0 flex-1 justify-start gap-[7px] rounded-none border-0 px-[3px] py-1.5 text-left text-[11px] text-inherit hover:!bg-transparent hover:!text-inherit", isSystemCategory && "text-ink/70")} onClick={() => onSelectCategory(category.id)} onDoubleClick={() => { if (!isSystemCategory) setEditingCategory(category.id); }}>
                        <Folder size={14} aria-hidden="true" /><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{category.title}</span>
                        <small className={cn("ml-auto text-[10px] font-medium text-ink/70", isSystemCategory && "tracking-[.2px]")}>{isSystemCategory ? "Default" : category.workspaceCount}</small>
                      </Button>
                    )}
                    <IconButton type="button" className="!size-6 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      aria-label={`New workspace in ${category.title}`} title={`New workspace in ${category.title}`} disabled={createLoading}
                      onClick={() => startCreate("workspace", category.id)}><Plus size={13} /></IconButton>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
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
                    <div className="ml-[27px] grid gap-px border-l border-line pt-0.5 pb-1">
                      {loading.has(category.id) && !children[category.id] && <div className="mx-[5px] mt-1 ml-[9px] grid gap-2 px-[3px] py-[5px]" role="status" aria-label={`Loading ${category.title}`}><span className="sr-only">Loading {category.title}…</span><Skeleton className="h-2 w-[min(76%,130px)]" /><Skeleton className="h-2 w-[min(52%,90px)] opacity-70" /></div>}
                      <AnimatePresence initial={false}>
                        {creating?.kind === "workspace" && creating.categoryId === category.id && <motion.div key={`workspace-create-${category.id}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("workspace", category.id)}</motion.div>}
                      </AnimatePresence>
                      {items.map((workspace) => (
                        <ContextMenu key={workspace.id} onOpenChange={(open) => { if (open) clearTransientState(); }}>
                          <ContextMenuTrigger asChild>
                            <div className={cn("group relative flex min-h-7 min-w-0 items-center gap-0.5 rounded-md pl-[9px] transition-colors hover:bg-tint hover:text-accent", activeWorkspaceId === workspace.id && "bg-tint")} draggable tabIndex={0} onDragStart={(event) => event.dataTransfer.setData("text/notespace-workspace", workspace.id)} onContextMenu={handleTriggerContextMenu} onKeyDown={(event) => {
                                handleTriggerKeyDown(event);
                                if (event.key === "F2") { event.preventDefault(); setEditingWorkspace(workspace.id); }
                              }}>
                              {activeWorkspaceId === workspace.id && <motion.span layoutId="notespace-active-workspace" className="pointer-events-none absolute inset-0 rounded-md bg-tint" transition={{ type: "spring", stiffness: 480, damping: 42 }} aria-hidden="true" />}
                              {editingWorkspace === workspace.id ? (
                                <Input className={inlineInputClass} autoFocus disabled={savingWorkspaceId === workspace.id} aria-busy={savingWorkspaceId === workspace.id} defaultValue={workspace.title} aria-label="Workspace title" onBlur={(event) => void saveWorkspace(workspace, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void saveWorkspace(workspace, event.currentTarget.value); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = workspace.title; setEditingWorkspace(null); } }} />
                              ) : (
                                <Link className="relative z-10 flex min-w-0 flex-1 items-center gap-[7px] px-[3px] py-[5px] text-[11px] text-inherit hover:text-inherit" to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} aria-current={activeWorkspaceId === workspace.id ? "page" : undefined} onDoubleClick={(event) => { event.preventDefault(); setEditingWorkspace(workspace.id); }}><FileText size={14} /><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{workspace.title}</span></Link>
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
                      ))}
                      {categoryErrors.has(category.id) && <div role="alert" className="mx-2 my-1 text-[10px] text-danger">Could not load Workspaces. <Button type="button" size="sm" variant="ghost" onClick={() => void retryCategory(category.id)}>Retry</Button></div>}
                      {hasMore(category.id) && <Button type="button" variant="ghost" size="sm" className="mx-[5px] mt-0.5 ml-[9px] w-auto justify-start px-[3px] py-[5px] text-[10px] font-medium text-accent" onClick={() => onSelectCategory(category.id)}>View all</Button>}
                      {!loading.has(category.id) && !categoryErrors.has(category.id) && !items.length && !creating && <Button type="button" variant="ghost" size="sm" className="mx-[5px] mt-0.5 ml-[9px] w-auto justify-start px-[3px] py-[5px] text-[10px] text-accent" onClick={() => startCreate("workspace", category.id)}>+ New workspace</Button>}
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
