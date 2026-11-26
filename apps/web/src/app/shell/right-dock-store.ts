import { createStore } from "../../shared/lib/store.ts";

export type RightDockMode = "library" | "sidecards" | "info" | "outline";
export type SideCardsLayout = "tabs" | "stack";

const WIDTH_STORAGE_KEY = "notespace-right-dock-width";
export const RIGHT_DOCK_MIN_WIDTH = 300;
export const RIGHT_DOCK_MAX_WIDTH = 540;
export const RIGHT_DOCK_DEFAULT_WIDTH = 368;

export function clampRightDockWidth(width: number): number {
  if (!Number.isFinite(width)) return RIGHT_DOCK_DEFAULT_WIDTH;
  return Math.max(RIGHT_DOCK_MIN_WIDTH, Math.min(RIGHT_DOCK_MAX_WIDTH, Math.round(width)));
}

function readStoredWidth(): number {
  try {
    if (typeof window === "undefined" || !window.localStorage) return RIGHT_DOCK_DEFAULT_WIDTH;
    const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY);
    if (!raw) return RIGHT_DOCK_DEFAULT_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampRightDockWidth(parsed) : RIGHT_DOCK_DEFAULT_WIDTH;
  } catch {
    return RIGHT_DOCK_DEFAULT_WIDTH;
  }
}

function writeStoredWidth(width: number) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Storage unavailable; degrade silently in memory.
  }
}

export interface RightDockState {
  open: boolean;
  mode: RightDockMode;
  width: number;
  selectedNoteId: string | null;
  libraryDetailNoteId: string | null;
  sideCardIds: string[];
  activeSideCardId: string | null;
  sideCardsLayout: SideCardsLayout;
  highlightBlockId: string | null;
}

function createInitialRightDockState(): RightDockState {
  return {
    open: false,
    mode: "library",
    width: readStoredWidth(),
    selectedNoteId: null,
    libraryDetailNoteId: null,
    sideCardIds: [],
    activeSideCardId: null,
    sideCardsLayout: "stack",
    highlightBlockId: null,
  };
}

export const rightDockStore = createStore<RightDockState>(createInitialRightDockState());

export function toggleRightDockMode(mode: RightDockMode) {
  rightDockStore.setState((current) => {
    if (current.open && current.mode === mode) {
      return { ...current, open: false };
    }
    return { ...current, open: true, mode };
  });
}

export function openRightDockMode(mode: RightDockMode) {
  rightDockStore.setState((current) => (
    current.open && current.mode === mode ? current : { ...current, open: true, mode }
  ));
}

export function closeRightDock() {
  rightDockStore.setState((current) => (
    current.open ? { ...current, open: false } : current
  ));
}

export function setRightDockWidth(width: number) {
  const clamped = clampRightDockWidth(width);
  writeStoredWidth(clamped);
  rightDockStore.setState((current) => (
    current.width === clamped ? current : { ...current, width: clamped }
  ));
}

/**
 * Updates the contextual selected Note ID without stealing the user's chosen Library view
 * or reopening a closed dock.
 */
export function selectDockNote(noteId: string | null) {
  rightDockStore.setState((current) => (
    current.selectedNoteId === noteId ? current : { ...current, selectedNoteId: noteId }
  ));
}

export function setLibraryDetailNoteId(noteId: string | null) {
  rightDockStore.setState((current) => (
    current.libraryDetailNoteId === noteId ? current : { ...current, libraryDetailNoteId: noteId }
  ));
}

export function openNoteInSideCards(
  noteId: string,
  options?: { focusDock?: boolean; blockId?: string | null },
) {
  rightDockStore.setState((current) => {
    const exists = current.sideCardIds.includes(noteId);
    const nextSideCardIds = exists ? current.sideCardIds : [noteId, ...current.sideCardIds];
    const shouldFocus = options?.focusDock !== false;
    return {
      ...current,
      open: shouldFocus ? true : current.open,
      mode: shouldFocus ? "sidecards" : current.mode,
      selectedNoteId: noteId,
      sideCardIds: nextSideCardIds,
      activeSideCardId: noteId,
      highlightBlockId: options?.blockId ?? null,
    };
  });
}

export function closeSideCard(noteId: string) {
  rightDockStore.setState((current) => {
    if (!current.sideCardIds.includes(noteId)) return current;
    const nextSideCardIds = current.sideCardIds.filter((id) => id !== noteId);
    const nextActive = current.activeSideCardId === noteId
      ? (nextSideCardIds[0] ?? null)
      : current.activeSideCardId;
    return {
      ...current,
      sideCardIds: nextSideCardIds,
      activeSideCardId: nextActive,
    };
  });
}

export function setActiveSideCard(noteId: string) {
  rightDockStore.setState((current) => (
    current.activeSideCardId === noteId && current.selectedNoteId === noteId
      ? current
      : { ...current, activeSideCardId: noteId, selectedNoteId: noteId }
  ));
}

export function setSideCardsLayout(sideCardsLayout: SideCardsLayout) {
  rightDockStore.setState((current) => (
    current.sideCardsLayout === sideCardsLayout ? current : { ...current, sideCardsLayout }
  ));
}

export function setDockHighlightBlockId(highlightBlockId: string | null) {
  rightDockStore.setState((current) => (
    current.highlightBlockId === highlightBlockId ? current : { ...current, highlightBlockId }
  ));
}

export function resetRightDockStore() {
  rightDockStore.setState({
    open: false,
    mode: "library",
    width: RIGHT_DOCK_DEFAULT_WIDTH,
    selectedNoteId: null,
    libraryDetailNoteId: null,
    sideCardIds: [],
    activeSideCardId: null,
    sideCardsLayout: "stack",
    highlightBlockId: null,
  });
}
