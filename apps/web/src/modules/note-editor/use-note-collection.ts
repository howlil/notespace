import { useCallback, useEffect, useRef, useState } from "react";
import {
  listNotesPage,
  type NoteCollectionScope,
  type NotePlacedFilter,
  type NoteSortMode,
  type NoteSummary,
} from "../../platform/api/note-api";

export type UseNoteCollectionOptions = {
  workspaceId?: string;
  initialPlaced?: NotePlacedFilter;
  initialSort?: NoteSortMode;
  initialScope?: NoteCollectionScope;
  initialTagIds?: string[];
  selectedNoteId?: string | null;
  pageSize?: number;
  enabled?: boolean;
};

export function useNoteCollection({
  workspaceId,
  initialPlaced = "all",
  initialSort = "updated",
  initialScope = "all",
  initialTagIds = [],
  selectedNoteId: initialSelectedNoteId = null,
  pageSize = 40,
  enabled = true,
}: UseNoteCollectionOptions = {}) {
  const [query, setQuery] = useState("");
  const [placed, setPlaced] = useState<NotePlacedFilter>(initialPlaced);
  const [sort, setSort] = useState<NoteSortMode>(initialSort);
  const [scope, setScope] = useState<NoteCollectionScope>(initialScope);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialSelectedNoteId);
  const [scopeWorkspaceId, setScopeWorkspaceId] = useState<string | undefined>(workspaceId);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);

  const generationRef = useRef(0);

  useEffect(() => {
    setScopeWorkspaceId(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const generation = ++generationRef.current;
    const trimmed = query.trim();
    const delay = trimmed ? 140 : 0;
    setStatus((prev) => (notes.length > 0 ? prev : "loading"));
    setErrorMessage(null);

    const timer = window.setTimeout(() => {
      void listNotesPage({
        q: trimmed || undefined,
        placed,
        workspaceId: scopeWorkspaceId,
        sort,
        tagIds: tagIds.length ? tagIds : undefined,
        scope,
        selectedNoteId: selectedNoteId ?? undefined,
        offset: 0,
        limit: pageSize,
      })
        .then((page) => {
          if (generationRef.current !== generation) return;
          setNotes(page.notes);
          setTotal(page.total);
          setHasMore(page.hasMore);
          setStatus("ready");
        })
        .catch((error) => {
          if (generationRef.current !== generation) return;
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Could not load Notes.");
        });
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pageSize, placed, query, refreshRevision, scope, scopeWorkspaceId, selectedNoteId, sort, tagIds]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    const generation = generationRef.current;
    setLoadingMore(true);
    try {
      const page = await listNotesPage({
        q: query.trim() || undefined,
        placed,
        workspaceId: scopeWorkspaceId,
        sort,
        tagIds: tagIds.length ? tagIds : undefined,
        scope,
        selectedNoteId: selectedNoteId ?? undefined,
        offset: notes.length,
        limit: pageSize,
      });
      if (generationRef.current !== generation) return;
      setNotes((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const next = [...prev];
        for (const item of page.notes) {
          if (!seen.has(item.id)) next.push(item);
        }
        return next;
      });
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch {
      // Retain existing list; user can retry load more.
    } finally {
      if (generationRef.current === generation) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore, notes.length, pageSize, placed, query, scope, scopeWorkspaceId, selectedNoteId, sort, tagIds]);

  const toggleTagId = useCallback((tagId: string) => {
    setTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }, []);

  const refresh = useCallback(() => {
    setRefreshRevision((value) => value + 1);
  }, []);

  const resetFilters = useCallback(() => {
    setQuery("");
    setPlaced("all");
    setSort("updated");
    setScope("all");
    setTagIds([]);
  }, []);

  return {
    query,
    setQuery,
    placed,
    setPlaced,
    sort,
    setSort,
    scope,
    setScope,
    tagIds,
    setTagIds,
    toggleTagId,
    selectedNoteId,
    setSelectedNoteId,
    scopeWorkspaceId,
    setScopeWorkspaceId,
    notes,
    total,
    hasMore,
    status,
    loadingMore,
    errorMessage,
    loadMore,
    refresh,
    resetFilters,
  };
}
