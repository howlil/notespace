import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

type DOMObserverLike = {
  flushingSoon?: number;
  flush?: () => void;
};

/**
 * Syncs pending DOM selection changes into ProseMirror before key handling runs.
 * Chromium defers `selectionchange` across frames after native caret movement
 * (such as `ArrowRight` collapsing a range selection), so fast `Enter` presses
 * otherwise execute against a stale non-empty selection and delete the word.
 */
export function syncPendingNoteDOMSelection(view: EditorView): boolean {
  if (view.isDestroyed || !view.editable || view.composing || !view.hasFocus()) return false;
  const observer = (view as unknown as { domObserver?: DOMObserverLike }).domObserver;
  if (observer && typeof observer.flush === "function") {
    if ((observer.flushingSoon ?? -1) >= 0) return false;
    const before = view.state.selection;
    observer.flush();
    if (!view.state.selection.eq(before)) return true;
  }
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;
  const domSelection = view.dom?.ownerDocument?.defaultView?.getSelection();
  if (!domSelection || !domSelection.isCollapsed || domSelection.rangeCount === 0) return false;
  const { anchorNode, anchorOffset } = domSelection;
  if (!anchorNode || !view.dom.contains(anchorNode)) return false;
  const pos = view.posAtDOM(anchorNode, anchorOffset);
  if (pos < 0 || pos > view.state.doc.content.size) return false;
  const next = TextSelection.create(view.state.doc, pos, pos);
  if (next.eq(selection)) return false;
  view.dispatch(view.state.tr.setSelection(next));
  return true;
}
