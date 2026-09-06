import { useEffect, useMemo, useState } from "react";
import { FileText, Folder, Search } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogTitle, cn } from "../../components/ui";
import type { CategorySummary, Note, Project, ProjectSummary } from "../../domain/project/project";
import { getProject, listCategories, listRecentWorkspaces, searchNotespace } from "../../domain/project/api";
import type { SearchResult } from "../../domain/project/api";
import { useToast } from "../../providers/toast-provider";
import { RecallMode } from "../study/RecallMode";

type Destination = { key: string; title: string; context: string; href: string; kind: "category" | "workspace" | "note" | "block" };

function resultHref(result: SearchResult) {
  if (result.type === "category" && result.categoryId) return `/categories/${encodeURIComponent(result.categoryId)}`;
  if (result.type === "workspace") return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
  return `/workspaces/${encodeURIComponent(result.workspaceId)}?note=${encodeURIComponent(result.noteId)}${result.blockId ? `&block=${encodeURIComponent(result.blockId)}` : ""}`;
}

function destinationOf(result: SearchResult): Destination {
  return {
    key: `${result.type}-${result.categoryId ?? ""}-${result.workspaceId}-${result.noteId}-${result.blockId}`,
    title: result.type === "category" ? result.categoryTitle || "Category" : result.type === "workspace" ? result.workspaceTitle : result.noteTitle,
    context: result.type === "category" ? "Category" : result.type === "workspace" ? result.categoryTitle || "Workspace" : `${result.workspaceTitle} · ${result.excerpt || "Open note"}`,
    href: resultHref(result),
    kind: result.type,
  };
}

export function QuickOpen() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<ProjectSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Project | null>(null);
  const [selected, setSelected] = useState(0);
  const [recallNote, setRecallNote] = useState<Note | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelected(0);
    let active = true;
    const workspaceMatch = pathname.match(/^\/(?:workspaces|projects)\/([^/]+)$/);
    const current = workspaceMatch ? getProject(decodeURIComponent(workspaceMatch[1])).catch(() => null) : Promise.resolve(null);
    void Promise.all([listRecentWorkspaces(8), listCategories(), current])
      .then(([nextRecent, nextCategories, workspace]) => {
        if (!active) return;
        setRecent(nextRecent);
        setCategories(nextCategories);
        setCurrentWorkspace(workspace);
      })
      .catch((error) => {
        if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Quick Open is unavailable." });
      });
    return () => { active = false; };
  }, [open, pathname, showToast]);

  useEffect(() => {
    if (!open) return;
    const value = query.trim();
    setSelected(0);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchNotespace(value)
        .then((next) => { if (active) setResults(next.slice(0, 20)); })
        .catch((error) => {
          if (active) showToast({ kind: "error", message: error instanceof Error ? error.message : "Search is unavailable." });
        });
    }, 140);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query, showToast]);

  const destinations = useMemo<Destination[]>(() => {
    if (query.trim().length >= 2) return results.map(destinationOf);
    const categoryNames = new Map(categories.map((category) => [category.id, category.title]));
    return recent.map((workspace) => ({
      key: `recent-${workspace.id}`,
      title: workspace.title,
      context: categoryNames.get(workspace.categoryId) ?? "Recent workspace",
      href: `/workspaces/${encodeURIComponent(workspace.id)}`,
      kind: "workspace" as const,
    }));
  }, [categories, query, recent, results]);

  function openDestination(destination: Destination | undefined) {
    if (!destination) return;
    setOpen(false);
    window.location.assign(destination.href);
  }

  function beginRecall(note: Note) {
    setOpen(false);
    window.setTimeout(() => setRecallNote(note), 0);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,640px)] p-0">
          <DialogTitle className="sr-only">Quick Open</DialogTitle>
          <DialogDescription className="sr-only">Open recent work or search the complete Notespace library.</DialogDescription>
          <div className="flex min-h-12 items-center gap-2 border-b border-line px-4">
            <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              autoFocus
              className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted"
              placeholder="Open workspace, note, block, or category…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && destinations.length) { event.preventDefault(); setSelected((value) => (value + 1) % destinations.length); }
                if (event.key === "ArrowUp" && destinations.length) { event.preventDefault(); setSelected((value) => (value - 1 + destinations.length) % destinations.length); }
                if (event.key === "Enter") { event.preventDefault(); openDestination(destinations[selected] ?? destinations[0]); }
              }}
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[9px] text-muted">Esc</kbd>
          </div>

          <div className="max-h-[min(64dvh,520px)] overflow-y-auto p-2">
            {!query.trim() && currentWorkspace?.notes.length ? (
              <section className="mb-2 border-b border-line pb-2">
                <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-[.08em] text-muted">Recall from current workspace</div>
                {currentWorkspace.notes.slice(0, 6).map((note) => (
                  <button key={note.id} className="flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-2 text-left hover:bg-tint focus-visible:bg-tint" onClick={() => beginRecall(note)}>
                    <FileText size={14} className="text-accent" />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-ink">Recall · {note.title}</span>
                  </button>
                ))}
              </section>
            ) : null}

            <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-[.08em] text-muted">{query.trim().length >= 2 ? "Search results" : "Recent workspaces"}</div>
            {destinations.length ? destinations.map((destination, index) => (
              <button
                key={destination.key}
                className={cn("flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left hover:bg-tint focus-visible:bg-tint", index === selected && "bg-tint")}
                onMouseEnter={() => setSelected(index)}
                onClick={() => openDestination(destination)}
              >
                {destination.kind === "category" ? <Folder size={15} className="shrink-0 text-accent" /> : <FileText size={15} className="shrink-0 text-accent" />}
                <span className="min-w-0 flex-1"><strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-ink">{destination.title}</strong><span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-muted">{destination.context}</span></span>
                <span className="text-[9px] text-muted">↵</span>
              </button>
            )) : <p className="m-0 px-2.5 py-5 text-[10px] text-muted">{query.trim().length >= 2 ? "No matching knowledge." : "No recent workspaces."}</p>}
          </div>
        </DialogContent>
      </Dialog>
      <RecallMode note={recallNote} open={recallNote !== null} onOpenChange={(next) => { if (!next) setRecallNote(null); }} />
    </>
  );
}
