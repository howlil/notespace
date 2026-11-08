import assert from "node:assert/strict";
import { test } from "node:test";
import { publishGranularConflict, subscribeWorkspaceConflict } from "./workspace-conflict-events.ts";

class TestCustomEvent<T> extends Event {
  readonly detail: T;
  constructor(type: string, init: CustomEventInit<T>) { super(type); this.detail = init.detail as T; }
}

test("Canvas conflict events publish exact drafts and unsubscribe cleanly", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousEvent = Object.getOwnPropertyDescriptor(globalThis, "CustomEvent");
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: TestCustomEvent });
  try {
    const drafts: unknown[] = [];
    const unsubscribe = subscribeWorkspaceConflict((draft) => drafts.push(draft));
    const draft = { kind: "canvas" as const, workspaceId: "workspace-1",
      local: { format: "excalidraw", version: 1, data: { elements: [] } }, latestVersion: 4 };
    publishGranularConflict(draft);
    assert.deepEqual(drafts, [draft]);
    unsubscribe();
    publishGranularConflict(draft);
    assert.equal(drafts.length, 1);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (previousEvent) Object.defineProperty(globalThis, "CustomEvent", previousEvent);
    else delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
  }
});

test("Canvas conflict events are inert without a browser window", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  delete (globalThis as { window?: unknown }).window;
  try {
    const unsubscribe = subscribeWorkspaceConflict(() => assert.fail("No browser event is expected"));
    assert.doesNotThrow(() => publishGranularConflict({ kind: "canvas", workspaceId: "workspace-1",
      local: { format: "excalidraw", version: 1, data: {} } }));
    unsubscribe();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  }
});
