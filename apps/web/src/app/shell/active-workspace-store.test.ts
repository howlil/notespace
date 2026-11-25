import assert from "node:assert/strict";
import test from "node:test";
import {
  activeWorkspaceStore,
  canPlaceNoteOnActiveCanvas,
  prepareActiveWorkspaceForDelete,
  registerActiveCanvasNotePlacer,
  registerActiveWorkspaceSession,
  requestPlaceNoteOnActiveCanvas,
  resetActiveWorkspaceStore,
  updateActiveWorkspaceVersion,
} from "./active-workspace-store.ts";

test("activeWorkspaceStore tracks session version and guards destructive deletes by workspaceId", async () => {
  resetActiveWorkspaceStore();
  let preparedCount = 0;

  try {
    const cleanupA = registerActiveWorkspaceSession({
      workspaceId: "ws-1",
      version: 3,
      prepareForDestructiveAction: async () => {
        preparedCount += 1;
        return 5;
      },
    });

    assert.equal(activeWorkspaceStore.getSnapshot().session?.version, 3);
    updateActiveWorkspaceVersion("ws-other", 99);
    assert.equal(activeWorkspaceStore.getSnapshot().session?.version, 3);

    updateActiveWorkspaceVersion("ws-1", 5);
    assert.equal(activeWorkspaceStore.getSnapshot().session?.version, 5);

    // Non-matching delete skips session hook
    assert.equal(await prepareActiveWorkspaceForDelete("ws-other"), true);
    assert.equal(preparedCount, 0);

    // Matching delete invokes session hook
    assert.equal(await prepareActiveWorkspaceForDelete("ws-1"), 5);
    assert.equal(preparedCount, 1);

    // Stale cleanup after a newer session mounts must not clobber the active session
    const cleanupB = registerActiveWorkspaceSession({
      workspaceId: "ws-2",
      version: 1,
      prepareForDestructiveAction: async () => true,
    });
    cleanupA();
    assert.equal(activeWorkspaceStore.getSnapshot().session?.workspaceId, "ws-2");

    cleanupB();
    assert.equal(activeWorkspaceStore.getSnapshot().session, null);
  } finally {
    resetActiveWorkspaceStore();
  }
});

test("activeWorkspaceStore manages canvas note placer capability with identity-safe cleanup", () => {
  resetActiveWorkspaceStore();
  const placed: string[] = [];

  try {
    assert.equal(canPlaceNoteOnActiveCanvas(), false);
    assert.equal(requestPlaceNoteOnActiveCanvas("note-1"), false);

    const cleanupFirst = registerActiveCanvasNotePlacer((id) => { placed.push(`first:${id}`); });
    assert.equal(canPlaceNoteOnActiveCanvas(), true);
    assert.equal(requestPlaceNoteOnActiveCanvas("note-1"), true);
    assert.deepEqual(placed, ["first:note-1"]);

    const cleanupSecond = registerActiveCanvasNotePlacer((id) => { placed.push(`second:${id}`); });
    // Stale cleanup must not clear the newer placer
    cleanupFirst();
    assert.equal(canPlaceNoteOnActiveCanvas(), true);
    assert.equal(requestPlaceNoteOnActiveCanvas("note-2"), true);
    assert.deepEqual(placed, ["first:note-1", "second:note-2"]);

    cleanupSecond();
    assert.equal(canPlaceNoteOnActiveCanvas(), false);
  } finally {
    resetActiveWorkspaceStore();
  }
});
