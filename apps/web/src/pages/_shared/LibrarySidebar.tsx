import { useLibraryCreateRequest } from "./library-create-context";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck2, FileText, Folder, FolderOpen, Home, Inbox, Pencil, Plus, Trash2, MoveRight } from "lucide-react";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, IconButton, Input, Skeleton, cn } from "../../shared/ui";
import { useLibraryNavigation } from "../../features/library/use-library-navigation";
import type { CategorySummary } from "../../domain/workspace/workspace";
import { NotespaceLogo } from "./NotespaceLogo";

export function Brand() {
  return <NotespaceLogo />;
}

type Props = { categories: CategorySummary[]; selectedCategoryId?: string; inboxActive?: boolean; todayActive?: boolean; onSelectCategory: (categoryId: string) => void; onChanged?: () => void };

const inlineInputClass = "min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0.5 py-[5px] text-[11px] focus:border-transparent";

export function LibrarySidebar({ categories, selectedCategoryId, inboxActive = false, todayActive = false, onSelectCategory, onChanged }: Props) {
  const {
    children,
    categoryErrors,
    creating,
    deleting,
    editingCategory,
    editingWorkspace,
    expanded,
    loading,
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
  } = useLibraryNavigation({ categories, onSelectCategory, onChanged });

  const createRequest = useLibraryCreateRequest();
  const handledCreateRequest = useRef(0);
  useEffect(() => {
    if (!createRequest || createRequest.sequence === handledCreateRequest.current) return;
    handledCreateRequest.current = createRequest.sequence;
    const defaultCategoryId = categories.find(item => item.id === "legacy")?.id ?? categories[0]?.id;
    startCreate(
      createRequest.kind,
      createRequest.kind === "workspace"
        ? (createRequest.categoryId || selectedCategoryId || defaultCategoryId)
        : undefined,
    );
  }, [categories, createRequest, selectedCategoryId, startCreate]);

  function dropWorkspace(categoryId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const workspaceId = event.dataTransfer.getData("text/notespace-workspace");
    if (workspaceId) void moveWorkspaceToCategory(categoryId, workspaceId);
  }

  const inlineCreate = (kind: "category" | "workspace", categoryId?: string) => (
    <form data-category-id={categoryId} className="mx-[5px] mt-[3px] mb-[5px] flex w-[calc(100%_-_14px)] min-w-0 items-center gap-[3px]" onSubmit={(event) => { event.preventDefault(); void submitCreate(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
      <Input className={cn(inlineInputClass, "w-px")} autoFocus aria-label={kind === "category" ? "Category title" : "Workspace title"} placeholder={kind === "category" ? "Category name" : "Workspace name"} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setCreating(null); } }} />
      <IconButton type="button" className="size-6 shrink-0 text-ink/70" aria-label={`Cancel new ${kind}`} title={`Cancel new ${kind}`} onClick={() => setCreating(null)}><span aria-hidden="true">×</span></IconButton>
    </form>
  );

  function clearTransientState() { setCreating(null); }
  function handleTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) { if (event.key === "Escape") clearTransientState(); }
  function handleTriggerContextMenu(event: MouseEvent<HTMLDivElement>) { event.stopPropagation(); clearTransientState(); }

  return <>
    <aside className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden border-r border-line bg-sidebar px-2 py-2" aria-label="Category explorer">
      <nav aria-label="Workspace navigation" className="grid shrink-0 gap-0.5 border-b border-line pb-2">
        <Link to="/" aria-current={!inboxActive && !todayActive ? "page" : undefined}
          className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-[11px] text-ink/70 hover:bg-tint hover:text-accent", !inboxActive && !todayActive && "bg-tint font-semibold text-accent")}>
          <Home size={14} aria-hidden="true" />Library
        </Link>
        <Link to="/today" aria-current={todayActive ? "page" : undefined}
          className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-[11px] text-ink/70 hover:bg-tint hover:text-accent", todayActive && "bg-tint font-semibold text-accent")}>
          <CalendarCheck2 size={14} aria-hidden="true" />Today
        </Link>
        <Link to="/inbox" aria-current={inboxActive ? "page" : undefined}
          className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-[11px] text-ink/70 hover:bg-tint hover:text-accent", inboxActive && "bg-tint font-semibold text-accent")}>
          <Inbox size={14} aria-hidden="true" />Capture Queue
        </Link>
      </nav>
      <div className="flex min-h-8 shrink-0 items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Workspaces</div>
      <AnimatePresence initial={false}>
        {creating?.kind === "category" && <motion.div key="category-create" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("category")}</motion.div>}
        {creating?.kind === "workspace" && !categories.some(item => item.id === creating.categoryId) && <motion.div key="workspace-create-top" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("workspace")}</motion.div>}
      </AnimatePresence>
      <nav aria-label="Categories" className="grid min-w-0 flex-1 content-start gap-0.5 overflow-auto pt-0.5 max-[560px]:min-h-0">
        {categories.map((category) => {
          const isOpen = expanded.has(category.id);
          const items = children[category.id] ?? [];
          const isSystemCategory = category.id === "legacy";
          const isSelected = selectedCategoryId === category.id;
          return (
            <div className="relative" key={category.id} data-system-category={isSystemCategory ? "true" : undefined} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropWorkspace(category.id, event)}>
              <ContextMenu onOpenChange={(open) => { if (open) clearTransientState(); }}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "flex min-h-8 min-w-0 items-center rounded-md",
                      isSelected && "bg-tint",
                      isSystemCategory && "bg-[color-mix(in_srgb,var(--surface)_55%,transparent)]",
                    )}
                    onContextMenu={handleTriggerContextMenu}
                    onKeyDown={(event) => {
                      handleTriggerKeyDown(event);
                      if (event.key === "F2" && !isSystemCategory) { event.preventDefault(); setEditingCategory(category.id); }
                    }}
                  >
                    <IconButton className={cn("grid h-[30px] w-[27px] shrink-0 place-items-center rounded-none text-ink/70", isSelected && "text-accent")} aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} title={`${isOpen ? "Collapse" : "Expand"} ${category.title}`} onClick={() => void toggleCategory(category)}>{isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}</IconButton>
                    {editingCategory === category.id && !isSystemCategory ? (
                      <Input className={inlineInputClass} autoFocus defaultValue={category.title} aria-label="Category title" onBlur={(event) => void saveCategory(category, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCategory(category, event.currentTarget.value); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = category.title; setEditingCategory(null); } }} />
                    ) : (
                      <Button variant="ghost" size="sm" className={cn("!min-h-0 min-w-0 flex-1 justify-start gap-[7px] rounded-none border-0 px-[3px] py-1.5 text-left text-[11px] text-ink hover:bg-transparent hover:text-accent", isSelected && "font-semibold text-accent", isSystemCategory && !isSelected && "text-ink/70")} onClick={() => onSelectCategory(category.id)} onDoubleClick={() => { if (!isSystemCategory) setEditingCategory(category.id); }}>
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{category.title}</span>
                        <small className={cn("ml-auto text-[10px] font-medium text-ink/70", isSelected && "text-accent", isSystemCategory && "tracking-[.2px]")}>{isSystemCategory ? "Default" : category.workspaceCount}</small>
                      </Button>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => startCreate("workspace", category.id)}><Plus size={13} /> New workspace</ContextMenuItem>
                  {!isSystemCategory && <ContextMenuItem onSelect={() => setEditingCategory(category.id)}><Pencil size={13} /> Rename category</ContextMenuItem>}
                  {!isSystemCategory && <ContextMenuItem className="text-danger" onSelect={() => setDeleting({ kind: "category", item: category })}><Trash2 size={13} /> Delete</ContextMenuItem>}
                </ContextMenuContent>
              </ContextMenu>
              {isOpen && (
                <div className="ml-[27px] grid gap-px border-l border-line pt-0.5 pb-1">
                  {loading === category.id && <div className="mx-[5px] mt-1 ml-[9px] grid gap-2 px-[3px] py-[5px]" role="status" aria-label={`Loading ${category.title}`}><span className="sr-only">Loading {category.title}…</span><Skeleton className="h-2 w-[min(76%,130px)]" /><Skeleton className="h-2 w-[min(52%,90px)] opacity-70" /></div>}
                  <AnimatePresence initial={false}>
                    {creating?.kind === "workspace" && creating.categoryId === category.id && <motion.div key={`workspace-create-${category.id}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">{inlineCreate("workspace", category.id)}</motion.div>}
                  </AnimatePresence>
                  {items.map((workspace) => (
                    <ContextMenu key={workspace.id} onOpenChange={(open) => { if (open) clearTransientState(); }}>
                      <ContextMenuTrigger asChild>
                        <div className="flex min-h-7 min-w-0 items-center gap-0.5 pl-[9px]" draggable tabIndex={0} onDragStart={(event) => event.dataTransfer.setData("text/notespace-workspace", workspace.id)} onContextMenu={handleTriggerContextMenu} onKeyDown={(event) => {
                            handleTriggerKeyDown(event);
                            if (event.key === "F2") { event.preventDefault(); setEditingWorkspace(workspace.id); }
                          }}>
                          {editingWorkspace === workspace.id ? (
                            <Input className={inlineInputClass} autoFocus defaultValue={workspace.title} aria-label="Workspace title" onBlur={(event) => void saveWorkspace(workspace, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveWorkspace(workspace, event.currentTarget.value); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = workspace.title; setEditingWorkspace(null); } }} />
                          ) : (
                            <Link className="flex min-w-0 flex-1 items-center gap-[7px] px-[3px] py-[5px] text-[11px] text-ink/70 hover:text-accent" to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} onDoubleClick={(event) => { event.preventDefault(); setEditingWorkspace(workspace.id); }}><FileText size={14} /><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{workspace.title}</span></Link>
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
                  {items.length >= 5 && <Button type="button" variant="ghost" size="sm" className="mx-[5px] mt-0.5 ml-[9px] w-auto justify-start px-[3px] py-[5px] text-[10px] font-medium text-accent" onClick={() => onSelectCategory(category.id)}>View all</Button>}
                  {!loading && !categoryErrors.has(category.id) && !items.length && !creating && <Button type="button" variant="ghost" size="sm" className="mx-[5px] mt-0.5 ml-[9px] w-auto justify-start px-[3px] py-[5px] text-[10px] text-accent" onClick={() => startCreate("workspace", category.id)}>+ New workspace</Button>}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
    <ConfirmDialog open={!!deleting} title={deleting?.kind === "category" ? "Delete this category?" : "Delete this workspace?"} description={deleting ? `“${deleting.item.title}” will be removed.` : ""} confirmLabel="Delete" onOpenChange={(open) => { if (!open) setDeleting(null); }} onConfirm={() => void confirmDelete()} />
  </>;
}
