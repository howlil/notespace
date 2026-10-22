import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

export type ExplorerPreference = "auto" | "open" | "closed";

const ExplorerContext = createContext<{
  preference: ExplorerPreference;
  setPreference: (value: ExplorerPreference) => void;
} | null>(null);

/** Preserve Explorer visibility across Library/Inbox/Today route remounts. */
export function LibraryExplorerProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ExplorerPreference>("auto");
  const locationKey = useRouterState({ select: (state) => `${state.location.pathname}|${JSON.stringify(state.location.search)}` });
  const previousLocationKey = useRef(locationKey);

  useEffect(() => {
    if (locationKey === previousLocationKey.current) return;
    previousLocationKey.current = locationKey;
    // A mobile Explorer is a transient overlay: never cover the next page after navigation.
    if (window.matchMedia("(max-width: 760px)").matches) setPreference("closed");
  }, [locationKey]);

  return (
    <ExplorerContext.Provider value={{ preference, setPreference }}>
      {children}
    </ExplorerContext.Provider>
  );
}

export function useLibraryExplorer() {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error("Library Explorer requires LibraryExplorerProvider");
  return value;
}
