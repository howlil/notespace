import { createStore } from "../../shared/lib/store.ts";

export type CanvasNotePlacerOptions = {
  clientPoint?: { x: number; y: number };
};

export type CanvasNotePlacer = (noteId: string, options?: CanvasNotePlacerOptions) => Promise<void> | void;

export type ActiveCanvasOutlineItem = {
  elementId: string;
  noteId?: string;
  label: string;
  kind: "note" | "frame" | "shortcut" | "object";
};

export type ActiveCanvasOutlineTree = {
  sections: Array<{
    elementId: string;
    label: string;
    children: ActiveCanvasOutlineItem[];
  }>;
  ungrouped: ActiveCanvasOutlineItem[];
};

export interface ActiveWorkspaceSessionHandle {
  workspaceId: string;
  version: number;
  prepareForDestructiveAction: () => Promise<boolean | number>;
}

export interface ActiveWorkspaceState {
  session: ActiveWorkspaceSessionHandle | null;
  notePlacer: CanvasNotePlacer | null;
  noteFocusHandler: ((noteId: string) => void) | null;
  elementFocusHandler: ((elementId: string) => void) | null;
  outlineItems: ActiveCanvasOutlineItem[];
  outlineTree: ActiveCanvasOutlineTree;
  pendingPlaceNote: { workspaceId: string; noteId: string } | null;
}

const initialActiveWorkspaceState: ActiveWorkspaceState = {
  session: null,
  notePlacer: null,
  noteFocusHandler: null,
  elementFocusHandler: null,
  outlineItems: [],
  outlineTree: { sections: [], ungrouped: [] },
  pendingPlaceNote: null,
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

export function requestPlaceNoteOnActiveCanvas(noteId: string, options?: CanvasNotePlacerOptions): boolean {
  const placer = activeWorkspaceStore.getSnapshot().notePlacer;
  if (!placer) return false;
  void placer(noteId, options);
  return true;
}

export function registerActiveCanvasFocusHandlers(handlers: {
  focusNote: (noteId: string) => void;
  focusElement: (elementId: string) => void;
}): () => void {
  activeWorkspaceStore.setState((current) => ({
    ...current,
    noteFocusHandler: handlers.focusNote,
    elementFocusHandler: handlers.focusElement,
  }));
  return () => {
    activeWorkspaceStore.setState((current) => (
      current.noteFocusHandler === handlers.focusNote
        ? { ...current, noteFocusHandler: null, elementFocusHandler: null }
        : current
    ));
  };
}

export function setActiveCanvasOutlineItems(
  outlineItems: ActiveCanvasOutlineItem[],
  outlineTree?: ActiveCanvasOutlineTree,
) {
  activeWorkspaceStore.setState((current) => ({
    ...current,
    outlineItems,
    outlineTree: outlineTree ?? { sections: [], ungrouped: outlineItems },
  }));
}

export function requestFocusNoteOnActiveCanvas(noteId: string): boolean {
  const handler = activeWorkspaceStore.getSnapshot().noteFocusHandler;
  if (!handler) return false;
  handler(noteId);
  return true;
}

export function requestFocusElementOnActiveCanvas(elementId: string): boolean {
  const handler = activeWorkspaceStore.getSnapshot().elementFocusHandler;
  if (!handler) return false;
  handler(elementId);
  return true;
}

export function queuePlaceNoteOnWorkspace(workspaceId: string, noteId: string) {
  activeWorkspaceStore.setState((current) => ({
    ...current,
    pendingPlaceNote: { workspaceId, noteId },
  }));
}

export function consumePendingPlaceNote(workspaceId: string): string | null {
  const pending = activeWorkspaceStore.getSnapshot().pendingPlaceNote;
  if (!pending || pending.workspaceId !== workspaceId) return null;
  activeWorkspaceStore.setState((current) => (
    current.pendingPlaceNote === pending ? { ...current, pendingPlaceNote: null } : current
  ));
  return pending.noteId;
}

export function prepareActiveWorkspaceForDelete(workspaceId: string): Promise<boolean | number> {
  const session = activeWorkspaceStore.getSnapshot().session;
  if (!session || session.workspaceId !== workspaceId) return Promise.resolve(true);
  return session.prepareForDestructiveAction();
}

export function resetActiveWorkspaceStore() {
  activeWorkspaceStore.setState(initialActiveWorkspaceState);
}
