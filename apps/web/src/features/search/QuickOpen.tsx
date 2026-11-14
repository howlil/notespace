import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Folder, Search, Settings2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  canPlaceNoteOnCanvas,
  requestPlaceNoteOnCanvas,
  subscribeCanvasNotePlacerAvailability,
} from "../../adapters/browser/canvas-note-placement-events";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, cn } from "../../shared/ui";
import type { CategorySummary, WorkspaceSummary } from "../../domain/workspace/workspace";
import { listCategories, listRecentWorkspaces, searchNotespace } from "../../adapters/http/workspace-api";
import type { SearchResult } from "../../adapters/http/workspace-api";
import { useToast } from "../../shared/ui/feedback/toast-provider";
import {
  destinationFromSearchResult,
  type QuickOpenDestination,
} from "./quick-open-model";
import { OPEN_QUICK_SEARCH_EVENT } from "./quick-search-events";


export function QuickOpen() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canPlaceOnCanvas = useSyncExternalStore(
    subscribeCanvasNotePlacerAvailability,
    canPlaceNoteOnCanvas,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<WorkspaceSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [searchState, setSearchState] = useState<{
    query: string;
    status: "loading" | "ready" | "error";
    results: SearchResult[];
  }>({ query: "", status: "loading", results: [] });
  const [recentStatus, setRecentStatus] = useState<"loading" | "ready" | "error">("loading");
  const [recentRevision, setRecentRevision] = useState(0);
  const [searchRevision, setSearchRevision] = useState(0);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        const activeElement = document.activeElement;
        const canvasOwnsShortcut = activeElement instanceof Element
          && Boolean(activeElement.closest(".notespace-canvas-surface"));
        if (canvasOwnsShortcut) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setRecentStatus("loading");
        setOpen(true);
      }
    };
    const customHandler = () => { setRecentStatus("loading"); setOpen(true); };

    window.addEventListener("keydown", handler, true);
    window.addEventListener(OPEN_QUICK_SEARCH_EVENT, customHandler);

    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener(OPEN_QUICK_SEARCH_EVENT, customHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRecentStatus("loading");
    setSelected(0);
    let active = true;
    void Promise.all([listRecentWorkspaces(8), listCategories()])
      .then(([nextRecent, nextCategories]) => {
        if (!active) return;
        setRecent(nextRecent);
        setCategories(nextCategories);
        setRecentStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setRecentStatus("error");
        showToast({ kind: "error", message: error instanceof Error ? error.message : "Quick Open is unavailable." });
      });
    return () => { active = false; };
  }, [open, recentRevision, showToast]);

  useEffect(() => {
    if (!open) return;
    const value = query.trim();
    setSelected(0);
    if (value.length < 2) return;
    setSearchState({ query: value, status: "loading", results: [] });
    let active = true;
    const timer = window.setTimeout(() => {
      void searchNotespace(value)
        .then((next) => {
          if (active) setSearchState({ query: value, status: "ready", results: next.slice(0, 20) });
        })
        .catch((error) => {
          if (!active) return;
          setSearchState({ query: value, status: "error", results: [] });
          showToast({ kind: "error", message: error instanceof Error ? error.message : "Search is unavailable." });
        });
    }, 140);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query, searchRevision, showToast]);

  const searching = query.trim().length >= 2;
  const resultStatus = searching
    ? searchState.query === query.trim() ? searchState.status : "loading"
    : recentStatus;

  const destinations = useMemo<QuickOpenDestination[]>(() => {
    if (query.trim().length >= 2) {
      return searchState.query === query.trim() && searchState.status === "ready"
        ? searchState.results.map(destinationFromSearchResult)
        : [];
    }
    if (recentStatus !== "ready") return [];
    const categoryNames = new Map(categories.map((category) => [category.id, category.title]));
    return recent.map((workspace) => ({
      key: `recent-${workspace.id}`,
      title: workspace.title,
      context: categoryNames.get(workspace.categoryId) ?? "Recent workspace",
      href: `/workspaces/${encodeURIComponent(workspace.id)}`,
      kind: "workspace" as const,
      workspaceId: workspace.id,
    }));
  }, [categories, query, recent, recentStatus, searchState]);

  function openDestination(destination: QuickOpenDestination | undefined) {
    if (!destination) return;
    setOpen(false);
    if (destination.kind === "category" && destination.categoryId) {
      void navigate({ to: "/", search: { category: destination.categoryId } });
      return;
    }
    if (destination.workspaceId) {
      void navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: destination.workspaceId }, search: { noteId: destination.kind === "note" ? destination.noteId : undefined } });
    }
  }

  function placeNoteDestination(noteId: string | undefined) {
    if (!noteId) return;
    setOpen(false);
    requestPlaceNoteOnCanvas(noteId);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,640px)] p-0">
          <DialogTitle className="sr-only">Quick Open</DialogTitle>
          <DialogDescription className="sr-only">Open recent work or search workspaces and categories.</DialogDescription>
          <div className="flex min-h-12 items-center gap-2 border-b border-line px-4">
            <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <Input
              autoFocus
              className="min-h-0 flex-1 rounded-none border-0 bg-transparent py-3 text-sm"
              placeholder="Open workspace or category…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && destinations.length) { event.preventDefault(); setSelected((value) => (value + 1) % destinations.length); }
                if (event.key === "ArrowUp" && destinations.length) { event.preventDefault(); setSelected((value) => (value - 1 + destinations.length) % destinations.length); }
                if (event.key === "Enter") { event.preventDefault(); openDestination(destinations[selected] ?? destinations[0]); }
              }}
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
          </div>

          <div className="max-h-[min(64dvh,520px)] overflow-y-auto p-2">
            {!query.trim() && <Button variant="ghost" size="sm" className="mb-2 w-full justify-start gap-2 rounded-md border-0 px-2.5 py-2 text-left"
              onClick={() => { setOpen(false); window.dispatchEvent(new Event("notespace:open-settings")); }}>
              <Settings2 size={14} aria-hidden="true" /> Settings &amp; Data
            </Button>}
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[.08em] text-muted">{query.trim().length >= 2 ? "Search results" : "Recent workspaces"}</div>
            {resultStatus === "loading" ? (
              <p className="m-0 px-2.5 py-5 text-[11px] text-muted" role="status" aria-live="polite">
                {searching ? "Searching Notespace…" : "Loading recent workspaces…"}
              </p>
            ) : resultStatus === "error" ? (
              <div role="alert" className="flex items-center justify-between gap-3 px-2.5 py-5 text-[11px] text-danger">
                <span>{searching ? "Search could not be loaded." : "Recent workspaces could not be loaded."}</span>
                <Button size="sm" variant="secondary" type="button" onClick={() => {
                  if (searching) setSearchRevision((value) => value + 1);
                  else setRecentRevision((value) => value + 1);
                }}>Retry</Button>
              </div>
            ) : destinations.length ? destinations.map((destination, index) => (
              <div
                key={destination.key}
                className={cn("flex items-center gap-1 rounded-md", index === selected && "bg-tint")}
                onMouseEnter={() => setSelected(index)}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="!min-h-0 min-w-0 flex-1 justify-start gap-2.5 rounded-md border-0 px-2.5 py-2 text-left"
                  onClick={() => openDestination(destination)}
                >
                  <Folder size={15} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1"><strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-ink">{destination.title}</strong><span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted">{destination.context}</span></span>
                  <span className="text-[10px] text-muted">↵</span>
                </Button>
                {canPlaceOnCanvas && destination.kind === "note" && destination.noteId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    title={`Place "${destination.title}" on this canvas`}
                    className="!min-h-0 mr-1.5 shrink-0 px-2 py-1 text-[10px]"
                    onClick={() => placeNoteDestination(destination.noteId)}
                  >
                    Place
                  </Button>
                )}
              </div>
            )) : <p className="m-0 px-2.5 py-5 text-[10px] text-muted">{query.trim().length >= 2 ? "No matching knowledge." : "No recent workspaces."}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
