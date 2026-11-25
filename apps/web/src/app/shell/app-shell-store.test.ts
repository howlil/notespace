import assert from "node:assert/strict";
import test from "node:test";
import {
  appShellStore,
  openAppSettings,
  openQuickOpen,
  resetAppShellStore,
  setAppSettingsOpen,
  setAppSettingsTab,
  setCanvasFullMode,
  setQuickOpen,
  toggleCanvasFullMode,
} from "./app-shell-store.ts";

test("appShellStore coordinates settings, quick open, and canvas full mode without redundant emissions", () => {
  resetAppShellStore();
  let emissions = 0;
  const unsubscribe = appShellStore.subscribe(() => {
    emissions += 1;
  });

  try {
    assert.deepEqual(appShellStore.getSnapshot(), {
      settingsOpen: false,
      settingsTab: "general",
      quickOpen: false,
      canvasFullMode: false,
    });

    openAppSettings("data");
    assert.equal(appShellStore.getSnapshot().settingsOpen, true);
    assert.equal(appShellStore.getSnapshot().settingsTab, "data");
    assert.equal(emissions, 1);

    // No-op transitions do not notify
    setAppSettingsTab("data");
    setAppSettingsOpen(true);
    assert.equal(emissions, 1);

    setAppSettingsTab("general");
    setAppSettingsOpen(false);
    assert.equal(appShellStore.getSnapshot().settingsOpen, false);
    assert.equal(appShellStore.getSnapshot().settingsTab, "general");
    assert.equal(emissions, 3);

    openQuickOpen();
    openQuickOpen();
    assert.equal(appShellStore.getSnapshot().quickOpen, true);
    assert.equal(emissions, 4);

    setQuickOpen(false);
    assert.equal(appShellStore.getSnapshot().quickOpen, false);
    assert.equal(emissions, 5);

    toggleCanvasFullMode();
    assert.equal(appShellStore.getSnapshot().canvasFullMode, true);
    setCanvasFullMode(true);
    assert.equal(emissions, 6);

    toggleCanvasFullMode();
    assert.equal(appShellStore.getSnapshot().canvasFullMode, false);
    assert.equal(emissions, 7);
  } finally {
    unsubscribe();
    resetAppShellStore();
  }
});
