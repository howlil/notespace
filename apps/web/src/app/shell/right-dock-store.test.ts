import assert from "node:assert/strict";
import test from "node:test";
import {
  clampRightDockWidth,
  closeRightDock,
  closeSideCard,
  openNoteInSideCards,
  resetRightDockStore,
  rightDockStore,
  selectDockNote,
  setRightDockWidth,
  setSideCardsLayout,
  toggleRightDockMode,
} from "./right-dock-store.ts";

test("toggleRightDockMode opens, switches, and collapses when clicking active mode", () => {
  resetRightDockStore();
  assert.equal(rightDockStore.getSnapshot().open, false);

  toggleRightDockMode("library");
  assert.equal(rightDockStore.getSnapshot().open, true);
  assert.equal(rightDockStore.getSnapshot().mode, "library");

  toggleRightDockMode("sidecards");
  assert.equal(rightDockStore.getSnapshot().open, true);
  assert.equal(rightDockStore.getSnapshot().mode, "sidecards");

  toggleRightDockMode("sidecards");
  assert.equal(rightDockStore.getSnapshot().open, false);
});

test("selectDockNote never steals Library mode or reopens a closed dock", () => {
  resetRightDockStore();
  selectDockNote("note-1");
  assert.equal(rightDockStore.getSnapshot().selectedNoteId, "note-1");
  assert.equal(rightDockStore.getSnapshot().open, false);

  toggleRightDockMode("library");
  selectDockNote("note-2");
  assert.equal(rightDockStore.getSnapshot().mode, "library");
  assert.equal(rightDockStore.getSnapshot().selectedNoteId, "note-2");
});

test("openNoteInSideCards deduplicates, activates, and closeSideCard promotes fallback", () => {
  resetRightDockStore();
  openNoteInSideCards("note-a");
  openNoteInSideCards("note-b");
  openNoteInSideCards("note-a");

  const snap = rightDockStore.getSnapshot();
  assert.equal(snap.open, true);
  assert.equal(snap.mode, "sidecards");
  assert.deepEqual(snap.sideCardIds, ["note-b", "note-a"]);
  assert.equal(snap.activeSideCardId, "note-a");

  closeSideCard("note-a");
  assert.deepEqual(rightDockStore.getSnapshot().sideCardIds, ["note-b"]);
  assert.equal(rightDockStore.getSnapshot().activeSideCardId, "note-b");

  setSideCardsLayout("tabs");
  assert.equal(rightDockStore.getSnapshot().sideCardsLayout, "tabs");
  closeRightDock();
  assert.equal(rightDockStore.getSnapshot().open, false);
});

test("clampRightDockWidth enforces 300..540 bounds", () => {
  resetRightDockStore();
  assert.equal(clampRightDockWidth(180), 300);
  assert.equal(clampRightDockWidth(900), 540);
  setRightDockWidth(420);
  assert.equal(rightDockStore.getSnapshot().width, 420);
});
