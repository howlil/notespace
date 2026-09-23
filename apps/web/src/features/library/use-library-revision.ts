import { useSyncExternalStore } from "react";
import { getLibraryRevision, subscribeLibraryChanges } from "../../adapters/browser/library-change";

export function useLibraryRevision() {
  return useSyncExternalStore(subscribeLibraryChanges, getLibraryRevision, getLibraryRevision);
}
