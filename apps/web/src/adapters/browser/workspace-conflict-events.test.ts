import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publishGranularConflict,
  publishWorkspaceConflict,
  subscribeWorkspaceConflict,
} from "./workspace-conflict-events.ts";

class TestCustomEvent<T> extends Event {
  readonly detail: T;

  constructor(type: string, init: { detail: T }) {
    super(type);
    this.detail = init.detail;
  }
}

test("workspace conflict events publish exact drafts and unsubscribe cleanly", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousCustomEvent = Object.getOwnPropertyDescriptor(globalThis, "CustomEvent");
  const target = new EventTarget();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: target,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: TestCustomEvent,
  });

  try {
    const drafts: unknown[] = [];
    const unsubscribe = subscribeWorkspaceConflict((draft) => drafts.push(draft));

    publishGranularConflict({
      kind: "note",
      workspaceId: "workspace-1",
      noteId: "note-1",
      local: {
        title: "Local",
        document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
        version: 2,
      },
      latest: {
        id: "note-1",
        title: "Remote",
        document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
        createdAt: "2026-09-25T00:00:00Z",
        updatedAt: "2026-09-25T00:00:00Z",
        version: 3,
      },
    });
    assert.equal(drafts.length, 1);
    assert.equal((drafts[0] as { kind: string }).kind, "note");

    unsubscribe();
    publishWorkspaceConflict({
      workspaceId: "workspace-1",
      local: {
        title: "Local",
        document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
        notes: [],
        canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
        references: [],
        splitRatio: 0.45,
      },
      latest: {
        id: "workspace-1",
        categoryId: "legacy",
        title: "Remote",
        createdAt: "2026-09-25T00:00:00Z",
        updatedAt: "2026-09-25T00:00:00Z",
        version: 3,
        document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
        notes: [],
        canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
        canvasVersion: 1,
        references: [],
        splitRatio: 0.45,
      },
    });
    assert.equal(drafts.length, 1);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (previousCustomEvent) Object.defineProperty(globalThis, "CustomEvent", previousCustomEvent);
    else delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
  }
});

test("workspace conflict events are inert without a browser window", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    delete (globalThis as { window?: unknown }).window;
    const unsubscribe = subscribeWorkspaceConflict(() => {
      throw new Error("listener should not be registered");
    });
    publishWorkspaceConflict({
      workspaceId: "workspace-1",
      local: {
        title: "Local",
        document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
        notes: [],
        canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
        references: [],
        splitRatio: 0.45,
      },
      latest: {
        id: "workspace-1",
        categoryId: "legacy",
        title: "Remote",
        createdAt: "2026-09-25T00:00:00Z",
        updatedAt: "2026-09-25T00:00:00Z",
        version: 3,
        document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
        notes: [],
        canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
        canvasVersion: 1,
        references: [],
        splitRatio: 0.45,
      },
    });
    unsubscribe();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  }
});
