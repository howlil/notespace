import { useEffect, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, FileText, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Button, Input, PopupSurface } from "../../components/ui";
import { ThemeToggle } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import type { CategorySummary, ProjectSummary, WorkspacePage } from "../../domain/project/project";
import { createProject, deleteProject, listCategoryWorkspaces, renameProject, updateCategory } from "../../domain/project/api";
import { WorkspaceListSkeleton } from "../../components/feedback/WorkspaceListSkeleton";
import { notifyLibraryChanged, useLibrarySyncStore } from "../library/library-sync-store";

function editedAt(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }

export function CategoryDetail({ category, initialPage }: { category: CategorySummary; initialPage: WorkspacePage }) {
  const { showToast } = useToast();
  const libraryRevision = useLibrarySyncStore((state) => state.revision);
  const [page, setPage] = useState(initialPage);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [hasCanvas, setHasCanvas] = useState(false);
  const [hasNotes, setHasNotes] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    void listCategoryWorkspaces(category.id, { query, sort, hasCanvas, hasNotes, offset, limit: 50 }).then((result) => { if (!cancelled) setPage(result); }).catch((err) => { if (!cancelled) showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load workspaces." }); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [category.id, query, sort, hasCanvas, hasNotes, offset, libraryRevision, showToast]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim() || creating) return;
    setCreating(true);
    try {
      const workspace = await createProject(title.trim(), category.id);
      setTitle("");
      notifyLibraryChanged();
      await router.invalidate();
      await navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: workspace.id } });
    }
    catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not create workspace." }); }
    finally { setCreating(false); }
  }
  async function saveCategory() {
    if (!categoryTitle.trim() || categoryTitle === category.title) { setEditingCategory(false); return; }
    try {
      await updateCategory(category.id, categoryTitle.trim());
      setEditingCategory(false);
      notifyLibraryChanged();
      await router.invalidate();
    } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not rename category." }); }
  }
  function beginWorkspaceRename(workspace: ProjectSummary) { setEditingWorkspace(workspace.id); setWorkspaceTitle(workspace.title); }
  async function saveWorkspace() {
    if (!editingWorkspace || !workspaceTitle.trim()) return;
    try {
      await renameProject(editingWorkspace, workspaceTitle.trim());
      setEditingWorkspace(null);
      notifyLibraryChanged();
      await router.invalidate();
    } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not rename workspace." }); }
  }
  async function removeWorkspace() {
    if (!deletingWorkspace) return;
    const workspace = deletingWorkspace;
    setDeletingWorkspace(null);
    try {
      await deleteProject(workspace.id);
      notifyLibraryChanged();
      await router.invalidate();
    } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not delete workspace." }); }
  }

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden bg-background">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-surface px-6 max-[560px]:px-5">
        <div className="flex min-w-0 items-baseline gap-3.5">
          <Link to="/" className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted hover:text-accent"><ArrowLeft size={15} /> Home</Link>
          <span className="text-[11px] text-muted">/</span><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted">Category</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-[1200px] p-8 max-[800px]:px-5 max-[800px]:py-6 max-[520px]:px-4 max-[520px]:py-5">
        <div className="mb-6 flex items-center justify-between gap-5 max-[800px]:flex-col max-[800px]:items-start max-[520px]:gap-4">
          <div className="min-w-0 max-w-full">
            {editingCategory ? (
              <Input
                className="min-h-0 w-full max-w-[min(100%,560px)] rounded-none border-0 bg-transparent p-px text-2xl font-medium tracking-[-.6px] focus:border-transparent"
                autoFocus
                value={categoryTitle}
                onChange={(event) => setCategoryTitle(event.target.value)}
                onBlur={() => void saveCategory()}
                onKeyDown={(event) => { if (event.key === "Enter") void saveCategory(); if (event.key === "Escape") { setCategoryTitle(category.title); setEditingCategory(false); } }}
              />
            ) : (
              <Button variant="ghost" size="sm" className="group !min-h-0 max-w-full min-w-0 !rounded-none justify-start border-0 bg-transparent p-0 text-2xl font-medium tracking-[-.6px] text-ink hover:bg-transparent" onClick={() => setEditingCategory(true)}>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{category.title}</span><Pencil size={14} className="shrink-0 text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </Button>
            )}
            <p className="mt-1.5 mb-0 text-[11px] text-muted">{page.total} workspace{page.total === 1 ? "" : "s"}</p>
          </div>
          <form className="flex max-w-full items-center gap-1.5 max-[520px]:w-full" onSubmit={create}>
            {creating ? null : (
              <Input className="min-h-8 w-[190px] min-w-0 rounded-none border-0 bg-transparent px-0.5 py-1.5 text-xs focus:border-transparent max-[520px]:w-auto max-[520px]:flex-1" aria-label="Workspace title" placeholder="New workspace" value={title} onChange={(event) => setTitle(event.target.value)} />
            )}
            {!creating && <Button className="min-h-8 shrink-0 px-2.5 py-1.5 text-[11px]" disabled={!title.trim()}><Plus size={15} /> Add workspace</Button>}
          </form>
        </div>

        <div className="mb-3 flex items-center gap-2 max-[800px]:flex-wrap max-[800px]:items-stretch">
          <label className="flex min-h-9 min-w-0 flex-1 items-center gap-2 border-b border-line px-2.5 text-muted max-[800px]:basis-full">
            <Search size={15} className="shrink-0" aria-hidden="true" />
            <Input className="min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-2 text-[11px] focus:border-transparent" aria-label="Search this category" placeholder="Search this category…" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} />
          </label>
          <select className="min-h-8 rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] text-ink max-[520px]:min-w-0 max-[520px]:flex-1" aria-label="Sort workspaces" value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }}>
            <option value="updated">Recently edited</option><option value="created">Recently created</option><option value="name">Alphabetical</option><option value="notes">Most notes</option>
          </select>
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-muted"><input type="checkbox" checked={hasNotes} onChange={(event) => { setHasNotes(event.target.checked); setOffset(0); }} /> Has notes</label>
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-muted"><input type="checkbox" checked={hasCanvas} onChange={(event) => { setHasCanvas(event.target.checked); setOffset(0); }} /> Has canvas</label>
        </div>

        <div className="min-h-40 border-t border-line" aria-busy={loading}>
          {loading && <WorkspaceListSkeleton rows={6} />}
          {!loading && !page.items.length ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-line bg-surface p-8 text-center max-[520px]:px-5">
              <span className="mb-4 grid size-12 place-items-center rounded-md bg-tint text-accent"><FileText size={22} /></span>
              <h2 className="m-0 text-lg font-medium">{query || hasNotes || hasCanvas ? "No matching workspaces" : "No workspaces yet"}</h2>
              <p className="mt-2 mb-5 text-[13px] leading-normal text-muted">{query || hasNotes || hasCanvas ? "Try another filter or search." : "Create the first workspace in this category."}</p>
            </div>
          ) : !loading && (
            <>
              <div className="grid min-h-9 grid-cols-[minmax(0,2fr)_minmax(110px,1fr)_100px_36px] items-center gap-3.5 px-3 text-[9px] tracking-[1px] text-muted uppercase max-[800px]:hidden"><span>Workspace</span><span>Content</span><span>Updated</span><span aria-hidden="true" /></div>
              {page.items.map((workspace) => (
                <div className="grid min-h-[52px] grid-cols-[minmax(0,2fr)_minmax(110px,1fr)_100px_36px] items-center gap-3.5 border-t border-line px-3 text-[11px] hover:bg-surface max-[800px]:grid-cols-[minmax(0,1fr)_36px] max-[800px]:gap-2 max-[800px]:px-1 max-[800px]:py-2" key={workspace.id}>
                  {editingWorkspace === workspace.id ? (
                    <Input className="min-h-0 w-full rounded-none border-0 bg-transparent p-px text-[11px]" autoFocus value={workspaceTitle} onChange={(event) => setWorkspaceTitle(event.target.value)} onBlur={() => void saveWorkspace()} onKeyDown={(event) => { if (event.key === "Enter") void saveWorkspace(); if (event.key === "Escape") setEditingWorkspace(null); }} />
                  ) : (
                    <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="flex min-w-0 items-center gap-2"><FileText size={15} className="shrink-0 text-accent" /><strong className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">{workspace.title}</strong></Link>
                  )}
                  <span className="text-[10px] text-muted max-[800px]:hidden">{workspace.noteCount ?? 0} notes{workspace.hasCanvas ? " · canvas" : ""}</span>
                  <time className="text-[10px] text-muted max-[800px]:hidden" dateTime={workspace.updatedAt}>{editedAt(workspace.updatedAt)}</time>
                  <details className="relative shrink-0 [&>summary::-webkit-details-marker]:hidden">
                    <summary className="grid size-8 list-none place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-tint hover:text-accent" aria-label={`Actions for ${workspace.title}`}><MoreHorizontal size={16} /></summary>
                    <PopupSurface className="absolute top-[calc(100%+4px)] right-2.5 z-20 grid w-max min-w-32 max-w-[calc(100vw_-_24px)] gap-0.5 p-1.5">
                      <Button variant="ghost" size="sm" className="w-full justify-start px-2.5 text-ink hover:text-accent" onClick={() => beginWorkspaceRename(workspace)}><Pencil size={14} /> Rename</Button>
                      <Button variant="ghost" size="sm" className="w-full justify-start px-2.5 text-danger hover:text-danger" onClick={() => setDeletingWorkspace(workspace)}><Trash2 size={14} /> Delete</Button>
                    </PopupSurface>
                  </details>
                </div>
              ))}
            </>
          )}
        </div>

        {page.total > page.limit && (
          <nav className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted" aria-label="Workspace pages">
            <Button variant="secondary" size="sm" className="min-h-8 px-2.5 py-1.5 text-[10px]" disabled={!page.offset} onClick={() => setOffset(Math.max(0, page.offset - page.limit))}>Previous</Button>
            <span>{page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total}</span>
            <Button variant="secondary" size="sm" className="min-h-8 px-2.5 py-1.5 text-[10px]" disabled={page.nextOffset === undefined} onClick={() => setOffset(page.nextOffset ?? page.offset)}>Next</Button>
          </nav>
        )}
      </main>
      <ConfirmDialog open={!!deletingWorkspace} title="Delete this workspace?" description={deletingWorkspace ? `“${deletingWorkspace.title}” will be removed.` : ""} confirmLabel="Delete" onOpenChange={(open) => { if (!open) setDeletingWorkspace(null); }} onConfirm={() => void removeWorkspace()} />
    </div>
  );
}
