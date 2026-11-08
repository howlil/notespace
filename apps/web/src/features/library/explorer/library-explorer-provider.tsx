import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { WorkspacePage } from "../../../domain/workspace/workspace";
import { listCategoryWorkspaces } from "../../../adapters/http/workspace-api";
import { useLibraryRevision } from "../use-library-revision";

export type ExplorerPreference = "auto" | "open" | "closed";

const ExplorerContext = createContext<{
  preference: ExplorerPreference;
  setPreference: (value: ExplorerPreference) => void;
  expandedCategories: Set<string>;
  setExpandedCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  categoryPages: Record<string, WorkspacePage>;
  loadingCategories: Set<string>;
  categoryErrors: Set<string>;
  loadCategory: (categoryId: string, force?: boolean) => Promise<void>;
} | null>(null);

export function LibraryExplorerProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ExplorerPreference>("auto");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [categoryPages, setCategoryPages] = useState<Record<string, WorkspacePage>>({});
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(() => new Set());
  const [categoryErrors, setCategoryErrors] = useState<Set<string>>(() => new Set());
  const libraryRevision = useLibraryRevision();
  const loadedRevisions = useRef(new Map<string, number>());
  const requests = useRef(new Map<string, { revision: number; token: symbol }>());
  const loadCategory = useCallback(async (categoryId: string, force = false) => {
    if (!force && (loadedRevisions.current.get(categoryId) === libraryRevision ||
      requests.current.get(categoryId)?.revision === libraryRevision)) return;
    const request = { revision: libraryRevision, token: Symbol() };
    requests.current.set(categoryId, request);
    setLoadingCategories((current) => new Set(current).add(categoryId));
    setCategoryErrors((current) => {
      const next = new Set(current);
      next.delete(categoryId);
      return next;
    });
    try {
      const page = await listCategoryWorkspaces(categoryId, { limit: 5 });
      if (requests.current.get(categoryId) !== request) return;
      loadedRevisions.current.set(categoryId, libraryRevision);
      setCategoryPages((current) => ({ ...current, [categoryId]: page }));
    } catch {
      if (requests.current.get(categoryId) !== request) return;
      setCategoryErrors((current) => new Set(current).add(categoryId));
    } finally {
      if (requests.current.get(categoryId) === request) {
        requests.current.delete(categoryId);
        setLoadingCategories((current) => {
          const next = new Set(current);
          next.delete(categoryId);
          return next;
        });
      }
    }
  }, [libraryRevision]);

  useEffect(() => {
    for (const categoryId of expandedCategories) void loadCategory(categoryId);
  }, [expandedCategories, loadCategory]);
  const locationKey = useRouterState({ select: (state) => `${state.location.pathname}|${JSON.stringify(state.location.search)}` });
  const previousLocationKey = useRef(locationKey);

  useEffect(() => {
    if (locationKey === previousLocationKey.current) return;
    previousLocationKey.current = locationKey;
    if (window.matchMedia("(max-width: 760px)").matches) setPreference("closed");
  }, [locationKey]);

  return (
    <ExplorerContext.Provider value={{ preference, setPreference, expandedCategories, setExpandedCategories,
      categoryPages, loadingCategories, categoryErrors, loadCategory }}>
      {children}
    </ExplorerContext.Provider>
  );
}

export function useLibraryExplorer() {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error("Library Explorer requires LibraryExplorerProvider");
  return value;
}
