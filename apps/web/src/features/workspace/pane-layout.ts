export const MAX_WORKSPACE_PANES = 4;

export type Pane = { id: string; kind: "note" | "canvas"; noteId?: string };
export type PaneNode =
  | { kind: "leaf"; pane: Pane }
  | { kind: "split"; id: string; direction: "row" | "column"; ratio: number; first: PaneNode; second: PaneNode };

export type PaneInteractionState = {
  paneLimitReached: boolean;
  canvasOpen: boolean;
  hasUnopenedNote: boolean;
  nextUnopenedNoteId?: string;
  canOpenNote: boolean;
  canOpenCanvas: boolean;
  canSplitNote: boolean;
  canClosePane: boolean;
};

export type PaneFocusTarget = { kind: "pane" | "split"; id: string };

function newId() {
  return crypto.randomUUID();
}

export function leafCount(node: PaneNode): number {
  return node.kind === "leaf" ? 1 : leafCount(node.first) + leafCount(node.second);
}

export function leaves(node: PaneNode): Pane[] {
  return node.kind === "leaf" ? [node.pane] : [...leaves(node.first), ...leaves(node.second)];
}

export function hasCanvasPane(node: PaneNode) {
  return leaves(node).some((pane) => pane.kind === "canvas");
}

export function canAddPane(node: PaneNode) {
  return leafCount(node) < MAX_WORKSPACE_PANES;
}

export function paneInteractionState(node: PaneNode, noteIds: readonly string[]): PaneInteractionState {
  const panes = leaves(node);
  const paneLimitReached = panes.length >= MAX_WORKSPACE_PANES;
  const canvasOpen = panes.some((pane) => pane.kind === "canvas");
  const openNoteIds = new Set(panes.map((pane) => pane.noteId).filter((noteId): noteId is string => Boolean(noteId)));
  const nextUnopenedNoteId = noteIds.find((noteId) => !openNoteIds.has(noteId));
  const hasUnopenedNote = Boolean(nextUnopenedNoteId);
  return {
    paneLimitReached,
    canvasOpen,
    hasUnopenedNote,
    nextUnopenedNoteId,
    canOpenNote: !paneLimitReached && hasUnopenedNote,
    canOpenCanvas: !paneLimitReached && !canvasOpen,
    canSplitNote: !paneLimitReached && hasUnopenedNote,
    canClosePane: panes.length > 1,
  };
}

export function findPane(node: PaneNode, id: string): Pane | undefined {
  return node.kind === "leaf" ? (node.pane.id === id ? node.pane : undefined) : findPane(node.first, id) ?? findPane(node.second, id);
}

export function findSplit(node: PaneNode, id: string): Extract<PaneNode, { kind: "split" }> | undefined {
  if (node.kind === "leaf") return undefined;
  if (node.id === id) return node;
  return findSplit(node.first, id) ?? findSplit(node.second, id);
}

export function findContainingSplit(node: PaneNode, paneId: string): Extract<PaneNode, { kind: "split" }> | undefined {
  if (node.kind === "leaf") return undefined;
  return findContainingSplit(node.first, paneId)
    ?? findContainingSplit(node.second, paneId)
    ?? (leaves(node.first).some((pane) => pane.id === paneId) || leaves(node.second).some((pane) => pane.id === paneId) ? node : undefined);
}

export function paneFocusTarget(node: PaneNode, paneId: string): PaneFocusTarget {
  const split = findContainingSplit(node, paneId);
  return split ? { kind: "split", id: split.id } : { kind: "pane", id: paneId };
}

export function mapNode(node: PaneNode, id: string, transform: (node: PaneNode) => PaneNode): PaneNode {
  if (node.kind === "leaf") return node.pane.id === id ? transform(node) : node;
  return { ...node, first: mapNode(node.first, id, transform), second: mapNode(node.second, id, transform) };
}

export function updateSplit(node: PaneNode, id: string, ratio: number): PaneNode {
  if (node.kind === "leaf") return node;
  if (node.id === id) return { ...node, ratio: Math.max(.2, Math.min(.8, ratio)) };
  return { ...node, first: updateSplit(node.first, id, ratio), second: updateSplit(node.second, id, ratio) };
}

export function removeNode(node: PaneNode, id: string): PaneNode {
  if (node.kind === "leaf") return node;
  if (node.first.kind === "leaf" && node.first.pane.id === id) return node.second;
  if (node.second.kind === "leaf" && node.second.pane.id === id) return node.first;
  return { ...node, first: removeNode(node.first, id), second: removeNode(node.second, id) };
}

export function defaultLayout(noteId: string): PaneNode {
  return {
    kind: "split",
    id: newId(),
    direction: "row",
    ratio: .5,
    first: { kind: "leaf", pane: { id: newId(), kind: "note", noteId } },
    second: { kind: "leaf", pane: { id: newId(), kind: "canvas" } },
  };
}

export function restoreLayout(key: string, noteIds: Set<string>): PaneNode {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as PaneNode | null;
    let canvasAvailable = true;
    const clean = (node: PaneNode): PaneNode | null => {
      if (!node || (node.kind !== "leaf" && node.kind !== "split")) return null;
      if (node.kind === "leaf") {
        if (node.pane.kind === "canvas") {
          if (!canvasAvailable) return null;
          canvasAvailable = false;
          return node;
        }
        if (node.pane.kind !== "note" || !node.pane.noteId || !noteIds.has(node.pane.noteId)) return null;
        return node;
      }
      const first = clean(node.first);
      const second = clean(node.second);
      if (!first) return second;
      if (!second) return first;
      return { ...node, ratio: Math.max(.2, Math.min(.8, node.ratio || .5)), first, second };
    };
    const result = stored ? clean(stored) : null;
    if (result && leafCount(result) <= MAX_WORKSPACE_PANES) return result;
  } catch {
    // Corrupt presentation state must never block authored content.
  }
  return defaultLayout([...noteIds][0] ?? "");
}
