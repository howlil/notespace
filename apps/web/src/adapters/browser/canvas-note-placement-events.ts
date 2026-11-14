type CanvasNotePlacer = (noteId: string) => Promise<void> | void;

let activePlacer: CanvasNotePlacer | null = null;
const availabilityListeners = new Set<() => void>();

function notifyAvailabilityListeners() {
  for (const listener of availabilityListeners) {
    listener();
  }
}

/**
 * Registers the editable canvas callback that places an existing Note onto the open workspace.
 * The returned cleanup only clears registration when this exact callback is still active.
 */
export function registerCanvasNotePlacer(placer: CanvasNotePlacer): () => void {
  activePlacer = placer;
  notifyAvailabilityListeners();
  return () => {
    if (activePlacer !== placer) return;
    activePlacer = null;
    notifyAvailabilityListeners();
  };
}

/** Reports whether an editable canvas is currently ready to place an existing Note. */
export function canPlaceNoteOnCanvas(): boolean {
  return activePlacer !== null;
}

/** Subscribes to placer availability changes for React `useSyncExternalStore`. */
export function subscribeCanvasNotePlacerAvailability(listener: () => void): () => void {
  availabilityListeners.add(listener);
  return () => {
    availabilityListeners.delete(listener);
  };
}

/** Dispatches placement of `noteId` onto the active editable canvas, returning false when unavailable. */
export function requestPlaceNoteOnCanvas(noteId: string): boolean {
  if (!activePlacer || !noteId) return false;
  void activePlacer(noteId);
  return true;
}
