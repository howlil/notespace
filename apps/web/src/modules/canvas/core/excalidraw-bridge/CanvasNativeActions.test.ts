import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { executeNativeAction, nativeActionAvailable, nativeActionIcon } from "./CanvasNativeActions.ts";

function apiFixture(icon: unknown = "icon") {
  const action = { icon };
  const calls: Array<{ action: unknown; source: string; value?: unknown }> = [];
  const api = {
    app: {
      props: { name: "Canvas fixture" },
      actionManager: {
        actions: { duplicate: action },
        executeAction(nextAction: unknown, source: string, value?: unknown) {
          calls.push({ action: nextAction, source, value });
        },
      },
    },
    getAppState: () => ({ zoom: { value: 1 } }),
    getSceneElements: () => [{ id: "shape-1" }],
    getSceneElementsIncludingDeleted: () => [{ id: "shape-1" }],
  } as unknown as ExcalidrawImperativeAPI;
  return { api, action, calls };
}

test("executeNativeAction returns false for missing actions and delegates known actions", () => {
  const { api, action, calls } = apiFixture();

  assert.equal(executeNativeAction(api, "missing"), false);
  assert.equal(executeNativeAction(api, "duplicate", 2), true);
  assert.deepEqual(calls, [{ action, source: "ui", value: 2 }]);
});

test("native action availability respects the installed action predicate", () => {
  const { api, action } = apiFixture();
  assert.equal(nativeActionAvailable(api, "missing"), false);
  assert.equal(nativeActionAvailable(api, "duplicate"), true);
  Object.assign(action, { predicate: () => false });
  assert.equal(nativeActionAvailable(api, "duplicate"), false);
  Object.assign(action, { predicate: (elements: readonly unknown[]) => elements.length === 1 });
  assert.equal(nativeActionAvailable(api, "duplicate"), true);
  Object.assign(action, { predicate: (_elements: unknown, state: unknown, props: unknown, app: unknown) => {
    assert.deepEqual(state, api.getAppState());
    assert.equal(props, api.app.props);
    assert.equal(app, api.app);
    return true;
  } });
  assert.equal(nativeActionAvailable(api, "duplicate"), true);
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
