import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { executeNativeAction, nativeActionIcon } from "./CanvasNativeActions.ts";

function apiFixture(icon: unknown = "icon") {
  const action = { icon };
  const calls: Array<{ action: unknown; source: string; value?: unknown }> = [];
  const api = {
    app: {
      actionManager: {
        actions: { duplicate: action },
        executeAction(nextAction: unknown, source: string, value?: unknown) {
          calls.push({ action: nextAction, source, value });
        },
      },
    },
    getAppState: () => ({ zoom: { value: 1 } }),
    getSceneElements: () => [{ id: "shape-1" }],
  } as unknown as ExcalidrawImperativeAPI;
  return { api, action, calls };
}

test("executeNativeAction returns false for missing actions and delegates known actions", () => {
  const { api, action, calls } = apiFixture();

  assert.equal(executeNativeAction(api, "missing"), false);
  assert.equal(executeNativeAction(api, "duplicate", 2), true);
  assert.deepEqual(calls, [{ action, source: "ui", value: 2 }]);
});

test("nativeActionIcon supports static and functional private Excalidraw icons", () => {
  const staticFixture = apiFixture("static-icon");
  assert.equal(nativeActionIcon(staticFixture.api, "duplicate"), "static-icon");
  assert.equal(nativeActionIcon(staticFixture.api, "missing"), null);
  assert.equal(nativeActionIcon(null, "duplicate"), null);

  let receivedAppState: unknown;
  let receivedElements: unknown;
  const dynamicFixture = apiFixture((appState: unknown, elements: unknown) => {
    receivedAppState = appState;
    receivedElements = elements;
    return "dynamic-icon";
  });
  assert.equal(nativeActionIcon(dynamicFixture.api, "duplicate"), "dynamic-icon");
  assert.deepEqual(receivedAppState, { zoom: { value: 1 } });
  assert.deepEqual(receivedElements, [{ id: "shape-1" }]);
});
