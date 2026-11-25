import type { Editor } from "@tiptap/core";
import type { NoteSummary } from "../../../platform/api/note-api";

export type CaretPosition = { left: number; top: number };
export type SelectionAnchor = { left: number; top: number; bottom: number };
export type NoteActivationPoint = { clientX: number; clientY: number };
export type NoteCreatedConnection = { noteId: string; elementId: string };

export const FALLBACK_POSITION: CaretPosition = { left: 8, top: 36 };
export const FALLBACK_ANCHOR: SelectionAnchor = { left: 140, top: 36, bottom: 56 };

export type ReferenceTargetNote = {
  noteId: string;
  workspaceId: string;
  label: string;
};

export type ReferenceState =
  | {
      mode: "mention";
      trigger: "[[" | "@";
      matchLength: number;
      query: string;
      step: "pick-note";
      position: CaretPosition;
    }
  | {
      mode: "slash-embed" | "slash-block-ref";
      query: string;
      step: "pick-note";
      position: CaretPosition;
    }
  | {
      mode: "mention" | "slash-block-ref";
      trigger?: "[[" | "@";
      matchLength?: number;
      query: string;
      step: "pick-block";
      targetNote: ReferenceTargetNote;
      position: CaretPosition;
    };

export type MathPromptState = {
  pos?: number;
  latex: string;
  block: boolean;
  originalBlock?: boolean;
  error: string | null;
  position: CaretPosition;
};

/** Maps a viewport point into the host's own unscaled coordinates so popups scale with zoomed surfaces. */
export function cardLocalPoint(host: HTMLElement, clientX: number, clientY: number): { x: number; y: number; width: number } {
  const box = host.getBoundingClientRect();
  const width = host.offsetWidth;
  const scale = width > 0 && box.width > 0 ? box.width / width : 1;
  return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale, width };
}

export function caretPosition(value: Editor, host: HTMLElement | null): CaretPosition {
  if (!host) return FALLBACK_POSITION;
  const coords = value.view.coordsAtPos(value.state.selection.from);
  const point = cardLocalPoint(host, coords.left, coords.bottom);
  return {
    left: Math.min(Math.max(8, point.x), Math.max(8, point.width - 200)),
    top: point.y + 4,
  };
}

export function posPosition(value: Editor, pos: number, host: HTMLElement | null): CaretPosition {
  if (!host) return FALLBACK_POSITION;
  const coords = value.view.coordsAtPos(pos);
  const point = cardLocalPoint(host, coords.left, coords.bottom);
  return {
    left: Math.min(Math.max(8, point.x), Math.max(8, point.width - 220)),
    top: point.y + 4,
  };
}

export function selectionAnchor(value: Editor, host: HTMLElement | null): SelectionAnchor {
  if (!host) return FALLBACK_ANCHOR;
  const { from, to, head } = value.state.selection;
  const start = value.view.coordsAtPos(from);
  const end = value.view.coordsAtPos(to);
  const headCoords = value.view.coordsAtPos(head);
  const sameLine = Math.abs(start.top - end.top) < 8;
  const centerClientX = sameLine ? (start.left + end.right) / 2 : headCoords.left;
  const topPoint = cardLocalPoint(host, centerClientX, Math.min(start.top, end.top));
  const bottomPoint = cardLocalPoint(host, centerClientX, Math.max(start.bottom, end.bottom));
  const clampedLeft = Math.min(Math.max(24, topPoint.x), Math.max(24, topPoint.width - 24));
  return {
    left: clampedLeft,
    top: topPoint.y,
    bottom: bottomPoint.y,
  };
}

export function focusEditorAtPoint(value: Editor, point: NoteActivationPoint | null | undefined) {
  if (point) {
    const hit = value.view.posAtCoords({ left: point.clientX, top: point.clientY });
    if (hit && Number.isInteger(hit.pos)) {
      value.commands.focus(hit.pos);
      return;
    }
  }
  value.commands.focus("end");
}

export function noteSummaryLabel(summary: NoteSummary): string {
  return summary.label.trim() || summary.excerpt.trim() || "Canvas Note";
}

export function noteSummaryWorkspace(summary: NoteSummary, currentWorkspaceId: string): string {
  if (summary.workspaceIds.includes(currentWorkspaceId)) return currentWorkspaceId;
  return summary.workspaceIds[0] || currentWorkspaceId;
}
