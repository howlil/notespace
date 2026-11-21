import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { syncPendingNoteDOMSelection } from "./note-selection-sync.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: { inline: true },
  },
});

function createState(anchor: number, head: number) {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("HighlightWord")]),
  ]);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, anchor, head),
  });
}

test("syncPendingNoteDOMSelection flushes pending domObserver selection changes", () => {
  let state = createState(14, 1);
  let flushed = 0;
  const fakeView = {
    isDestroyed: false,
    editable: true,
    composing: false,
    hasFocus: () => true,
    get state() { return state; },
    domObserver: {
      flushingSoon: -1,
      flush: () => {
        flushed += 1;
        state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 14, 14)));
      },
    },
  } as unknown as EditorView;

  assert.equal(syncPendingNoteDOMSelection(fakeView), true);
  assert.equal(flushed, 1);
  assert.equal(state.selection.empty, true);
  assert.equal(state.selection.from, 14);
});

test("syncPendingNoteDOMSelection skips composing, blurred, or scheduled-flush views", () => {
  const state = createState(14, 1);
  let flushed = 0;
  const baseView = (overrides: Record<string, unknown>) => ({
    isDestroyed: false,
    editable: true,
    composing: false,
    hasFocus: () => true,
    state,
    domObserver: { flushingSoon: -1, flush: () => { flushed += 1; } },
    ...overrides,
  }) as unknown as EditorView;

  assert.equal(syncPendingNoteDOMSelection(baseView({ composing: true })), false);
  assert.equal(syncPendingNoteDOMSelection(baseView({ hasFocus: () => false })), false);
  assert.equal(syncPendingNoteDOMSelection(baseView({ editable: false })), false);
  assert.equal(syncPendingNoteDOMSelection(baseView({ domObserver: { flushingSoon: 1, flush: () => { flushed += 1; } } })), false);
  assert.equal(flushed, 0);
});

test("syncPendingNoteDOMSelection collapses stale non-empty TextSelection from DOM caret fallback", () => {
  let state = createState(14, 1);
  const textNode = {};
  const fakeDom = {
    contains: (node: unknown) => node === textNode,
    ownerDocument: {
      defaultView: {
        getSelection: () => ({
          isCollapsed: true,
          rangeCount: 1,
          anchorNode: textNode,
          anchorOffset: 13,
        }),
      },
    },
  };
  const fakeView = {
    isDestroyed: false,
    editable: true,
    composing: false,
    hasFocus: () => true,
    dom: fakeDom,
    get state() { return state; },
    posAtDOM: (_node: unknown, offset: number) => offset + 1,
    dispatch: (tr: ReturnType<EditorState["tr"]["setSelection"]>) => {
      state = state.apply(tr);
    },
  } as unknown as EditorView;

  assert.equal(syncPendingNoteDOMSelection(fakeView), true);
  assert.equal(state.selection.empty, true);
  assert.equal(state.selection.from, 14);
});

test("syncPendingNoteDOMSelection falls back to DOM caret when domObserver.flush leaves stale selection", () => {
  let state = createState(14, 1);
  const textNode = {};
  let flushed = 0;
  const fakeDom = {
    contains: (node: unknown) => node === textNode,
    ownerDocument: {
      defaultView: {
        getSelection: () => ({
          isCollapsed: true,
          rangeCount: 1,
          anchorNode: textNode,
          anchorOffset: 13,
        }),
      },
    },
  };
  const fakeView = {
    isDestroyed: false,
    editable: true,
    composing: false,
    hasFocus: () => true,
    dom: fakeDom,
    get state() { return state; },
    domObserver: {
      flushingSoon: -1,
      flush: () => { flushed += 1; },
    },
    posAtDOM: (_node: unknown, offset: number) => offset + 1,
    dispatch: (tr: ReturnType<EditorState["tr"]["setSelection"]>) => {
      state = state.apply(tr);
    },
  } as unknown as EditorView;

  assert.equal(syncPendingNoteDOMSelection(fakeView), true);
  assert.equal(flushed, 1);
  assert.equal(state.selection.empty, true);
  assert.equal(state.selection.from, 14);
});
