import { useSyncExternalStore } from "react";
import { getLibraryRevision, subscribeLibraryChanges } from "../../platform/api/library-invalidation";

export function useLibraryRevision() {
  return useSyncExternalStore(subscribeLibraryChanges, getLibraryRevision, getLibraryRevision);
}
