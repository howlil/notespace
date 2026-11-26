import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { WorkspacePage } from "../../../entities/workspace";
import { listChildWorkspaces, listRootWorkspaces } from "../../../platform/api/workspace-api";
import { useLibraryRevision } from "../use-library-revision";

type ExplorerPreference = "auto" | "open" | "closed";

export const ROOT_CONTEXT_KEY = "__root__";

export function contextKeyForParent(parentId: string | null | undefined): string {
  return parentId || ROOT_CONTEXT_KEY;
}

const ExplorerContext = createContext<{
  preference: ExplorerPreference;
  setPreference: (value: ExplorerPreference) => void;
  drawerOpen: boolean;
  setDrawerOpen: (value: boolean) => void;
  childrenPages: Record<string, WorkspacePage>;
  loadingKeys: Set<string>;
  errorKeys: Set<string>;
  loadChildren: (parentId: string | null, force?: boolean) => Promise<void>;
} | null>(null);

export function LibraryExplorerProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ExplorerPreference>("auto");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [childrenPages, setChildrenPages] = useState<Record<string, WorkspacePage>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set());
  const [errorKeys, setErrorKeys] = useState<Set<string>>(() => new Set());
  const libraryRevision = useLibraryRevision();
  const loadedRevisions = useRef(new Map<string, number>());
  const requests = useRef(new Map<string, { revision: number; token: symbol }>());

  const loadChildren = useCallback(async (parentId: string | null, force = false) => {
    const key = contextKeyForParent(parentId);
    if (!force && (loadedRevisions.current.get(key) === libraryRevision ||
      requests.current.get(key)?.revision === libraryRevision)) return;
    const request = { revision: libraryRevision, token: Symbol() };
    requests.current.set(key, request);
    setLoadingKeys((current) => new Set(current).add(key));
    setErrorKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    try {
      const page = parentId
        ? await listChildWorkspaces(parentId, { limit: 50 })
        : await listRootWorkspaces({ limit: 50 });
      if (requests.current.get(key) !== request) return;
      loadedRevisions.current.set(key, libraryRevision);
      setChildrenPages((current) => ({ ...current, [key]: page }));
    } catch {
      if (requests.current.get(key) !== request) return;
      setErrorKeys((current) => new Set(current).add(key));
    } finally {
      if (requests.current.get(key) === request) {
        requests.current.delete(key);
        setLoadingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    }
  }, [libraryRevision]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    document.querySelector<HTMLButtonElement>('[data-explorer-toggle]')?.focus({ preventScroll: true });
  }, []);

  // A Home activation can keep the same URL. Dismiss presentation without
  // introducing another navigation owner, including the native titlebar link.
  useEffect(() => {
    if (!drawerOpen) return;
    const onHomeClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest('a[aria-label="Notespace home"]')) closeDrawer();
    };
    document.addEventListener("click", onHomeClick);
    return () => document.removeEventListener("click", onHomeClick);
  }, [closeDrawer, drawerOpen]);

  const locationKey = useRouterState({ select: (state) => `${state.location.pathname}|${JSON.stringify(state.location.search)}` });
  const previousLocationKey = useRef(locationKey);

  useEffect(() => {
    if (locationKey === previousLocationKey.current) return;
    previousLocationKey.current = locationKey;
    if (!drawerOpen) return;
    closeDrawer();
  }, [closeDrawer, drawerOpen, locationKey]);

  return (
    <ExplorerContext.Provider value={{
      preference,
      setPreference,
      drawerOpen,
      setDrawerOpen,
      childrenPages,
      loadingKeys,
      errorKeys,
      loadChildren,
    }}>
      {children}
    </ExplorerContext.Provider>
  );
}

export function useLibraryExplorer() {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error("Library Explorer requires LibraryExplorerProvider");
  return value;
}
