import { useEffect, useMemo, useState } from "react";
import { Folder, StickyNote } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button, CommandListDialog, Kbd, SectionLabel, cn } from "../../shared/ui";
import { useStore } from "../../shared/lib/use-store";
import type { CategorySummary, WorkspaceSummary } from "../../entities/workspace";
import { listCategories, listRecentWorkspaces, searchNotespace } from "../../platform/api/workspace-api";
import type { SearchResult } from "../../platform/api/workspace-api";
import { useToast } from "../../shared/ui/feedback/toast-provider";
import {
  activeWorkspaceStore,
  requestPlaceNoteOnActiveCanvas,
} from "../shell/active-workspace-store";
import {
  appShellStore,
  openQuickOpen,
  setQuickOpen,
} from "../shell/app-shell-store";
import {
  destinationFromSearchResult,
  resolveQuickOpenAction,
  type QuickOpenDestination,
} from "./quick-open-model";


export function QuickOpen() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canPlaceOnCanvas = useStore(activeWorkspaceStore, (state) => state.notePlacer !== null);
  const open = useStore(appShellStore, (state) => state.quickOpen);
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
        openQuickOpen();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
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
    const action = resolveQuickOpenAction(destination, { canPlaceOnCanvas });
    if (!action) return;
    if (action.type === "place-note") {
      placeNoteDestination(action.noteId);
      return;
    }
    setQuickOpen(false);
    if (action.type === "toast-unplaced-note") {
      showToast({ kind: "info", message: action.message });
      return;
    }
    if (action.type === "navigate-category") {
      void navigate({ to: "/", search: { category: action.categoryId } });
      return;
    }
    void navigate({
      to: "/workspaces/$workspaceId",
      params: { workspaceId: action.workspaceId },
      search: { noteId: action.noteId },
    });
  }

  function placeNoteDestination(noteId: string | undefined) {
    if (!noteId) return;
    setQuickOpen(false);
    requestPlaceNoteOnActiveCanvas(noteId);
  }

  return (
    <CommandListDialog
      open={open}
      onOpenChange={setQuickOpen}
      title="Quick Open"
      description="Open recent work or search workspaces and categories."
      size="md"
      query={query}
      onQueryChange={setQuery}
      placeholder="Search workspaces, notes, or categories…"
      searchRightSlot={<Kbd>Esc</Kbd>}
      status={resultStatus}
      loadingFallback={(
        <p className="m-0 px-2 py-3 text-sm text-muted" role="status" aria-live="polite">
          {searching ? "Searching Notespace…" : "Loading recent workspaces…"}
        </p>
      )}
      errorMessage={searching ? "Search could not be loaded." : "Recent workspaces could not be loaded."}
      onRetry={() => {
        if (searching) setSearchRevision((value) => value + 1);
        else setRecentRevision((value) => value + 1);
      }}
      items={destinations}
      selectedIndex={selected}
      onSelectedIndexChange={setSelected}
      onSelect={(destination) => openDestination(destination)}
      bodyHeader={<SectionLabel title={searching ? "Search results" : "Recent workspaces"} className="px-2 pt-0.5 pb-1" />}
      emptyFallback={<p className="m-0 px-2 py-3 text-xs text-muted">{searching ? "No matching knowledge." : "No recent workspaces."}</p>}
      renderItem={(destination, { selected: isSelected, index }) => (
        <div
          key={destination.key}
          className={cn("flex items-center gap-1 rounded-lg transition-colors", isSelected && "bg-tint")}
          onMouseEnter={() => setSelected(index)}
        >
          <button
            type="button"
            className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => openDestination(destination)}
          >
            {destination.kind === "note"
              ? <StickyNote size={14} className={cn("shrink-0", isSelected ? "text-accent" : "text-muted")} aria-hidden="true" />
              : <Folder size={14} className={cn("shrink-0", isSelected ? "text-accent" : "text-muted")} aria-hidden="true" />}
            <span className={cn("min-w-0 truncate text-nav font-medium", isSelected ? "text-accent" : "text-ink")}>
              {destination.title}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">
              {destination.context}
            </span>
            {isSelected && <Kbd tone="surface">↵</Kbd>}
          </button>
          {canPlaceOnCanvas && destination.kind === "note" && destination.noteId && (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              title={`Place "${destination.title}" on this canvas`}
              className="mr-1 shrink-0"
              onClick={() => placeNoteDestination(destination.noteId)}
            >
              Place
            </Button>
          )}
        </div>
      )}
    />
  );
}
