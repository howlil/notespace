let revision = 0;
const listeners = new Set<() => void>();

export function notifyLibraryChanged() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeLibraryChanges(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibraryRevision() {
  return revision;
}
