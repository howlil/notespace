import { createStore } from "../../shared/lib/store.ts";

export type CanvasNotePlacer = (noteId: string) => Promise<void> | void;

export interface ActiveWorkspaceSessionHandle {
  workspaceId: string;
  version: number;
  prepareForDestructiveAction: () => Promise<boolean | number>;
}

export interface ActiveWorkspaceState {
  session: ActiveWorkspaceSessionHandle | null;
  notePlacer: CanvasNotePlacer | null;
}

const initialActiveWorkspaceState: ActiveWorkspaceState = {
  session: null,
  notePlacer: null,
};

export const activeWorkspaceStore = createStore<ActiveWorkspaceState>(initialActiveWorkspaceState);

export function registerActiveWorkspaceSession(session: ActiveWorkspaceSessionHandle): () => void {
  activeWorkspaceStore.setState((current) => ({
    ...current,
    session,
  }));
  return () => {
    activeWorkspaceStore.setState((current) => (
      current.session === session ? { ...current, session: null } : current
    ));
  };
}

export function updateActiveWorkspaceVersion(workspaceId: string, version: number) {
  activeWorkspaceStore.setState((current) => {
    if (!current.session || current.session.workspaceId !== workspaceId) return current;
    if (current.session.version === version) return current;
    return {
      ...current,
      session: { ...current.session, version },
    };
  });
}

export function registerActiveCanvasNotePlacer(placer: CanvasNotePlacer): () => void {
  activeWorkspaceStore.setState((current) => ({
    ...current,
    notePlacer: placer,
  }));
  return () => {
    activeWorkspaceStore.setState((current) => (
      current.notePlacer === placer ? { ...current, notePlacer: null } : current
    ));
  };
}

export function canPlaceNoteOnActiveCanvas(): boolean {
  return activeWorkspaceStore.getSnapshot().notePlacer !== null;
}

export function requestPlaceNoteOnActiveCanvas(noteId: string): boolean {
  const placer = activeWorkspaceStore.getSnapshot().notePlacer;
  if (!placer) return false;
  void placer(noteId);
  return true;
}

export function prepareActiveWorkspaceForDelete(workspaceId: string): Promise<boolean | number> {
  const session = activeWorkspaceStore.getSnapshot().session;
  if (!session || session.workspaceId !== workspaceId) return Promise.resolve(true);
  return session.prepareForDestructiveAction();
}

export function resetActiveWorkspaceStore() {
  activeWorkspaceStore.setState(initialActiveWorkspaceState);
}
