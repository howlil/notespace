import assert from "node:assert/strict";
import test from "node:test";
import { APIError } from "../../../adapters/http/client.ts";
import {
  GranularConflictError,
  saveWorkspaceCanvasWith,
  saveWorkspaceNoteWith,
  type GranularSaveDependencies,
} from "./granular-save-core.ts";
import type { Note, Snapshot } from "../../../domain/workspace/workspace.ts";

function document(text = "hello"): Snapshot {
  return {
    format: "tiptap",
    version: 1,
    data: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  };
}

function canvas(elements: Array<Record<string, unknown>> = []): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: { elements, appState: {}, files: {} },
  };
}

function note(version = 2): Note {
  return {
    id: "note-1",
    title: "Note",
    document: document(),
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T01:00:00Z",
    version,
  };
}

function harness(overrides: Partial<GranularSaveDependencies> = {}) {
  const conflicts: unknown[] = [];
  const calls = {
    noteVersions: [] as number[],
    canvasVersions: [] as number[],
    getCanvas: 0,
  };
  const deps: GranularSaveDependencies = {
    updateNote: async (_workspaceId, _noteId, input) => {
      calls.noteVersions.push(input.version);
      return { ...note(input.version + 1), title: input.title, document: input.document };
    },
    getCanvas: async () => {
      calls.getCanvas += 1;
      return { canvas: canvas(), version: 4, updatedAt: "2026-09-25T01:00:00Z" };
    },
    updateCanvas: async (_workspaceId, value, version) => {
      calls.canvasVersions.push(version);
      return { canvas: value, version: version + 1, updatedAt: "2026-09-25T01:00:00Z" };
    },
    publishConflict: (draft) => { conflicts.push(draft); },
    ...overrides,
  };
  return { calls, conflicts, deps };
}

test("granular Note save forwards the optimistic version and returns the durable Note", async () => {
  const { calls, deps } = harness();
  const saved = await saveWorkspaceNoteWith(
    deps,
    "workspace-1",
    "note-1",
    { title: "Updated", document: document("updated") },
    7,
  );

  assert.equal(calls.noteVersions[0], 7);
  assert.equal(saved.version, 8);
  assert.equal(saved.title, "Updated");
});

test("granular Note conflict publishes the local draft and blocks autosave", async () => {
  const { conflicts, deps } = harness({
    updateNote: async () => { throw new APIError(409, "conflict"); },
  });

  await assert.rejects(
    saveWorkspaceNoteWith(
      deps,
      "workspace-1",
      "note-1",
      { title: "Local", document: document("local") },
      3,
    ),
    GranularConflictError,
  );

  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0], {
    kind: "note",
    workspaceId: "workspace-1",
    noteId: "note-1",
    local: { title: "Local", document: document("local"), version: 3 },
  });
});

test("granular Note save propagates non-conflict failures without publishing recovery state", async () => {
  const { conflicts, deps } = harness({
    updateNote: async () => { throw new APIError(500, "server failed"); },
  });

  await assert.rejects(
    saveWorkspaceNoteWith(deps, "workspace-1", "note-1", { title: "Local", document: document() }, 2),
    /server failed/,
  );
  assert.equal(conflicts.length, 0);
});

test("granular Canvas save accepts latest durable state when another tab already converged", async () => {
  const local = canvas([{ id: "shape", version: 2, versionNonce: 2, index: "a0" }]);
  const { calls, deps } = harness({
    updateCanvas: async () => { throw new APIError(409, "conflict"); },
    getCanvas: async () => {
      calls.getCanvas += 1;
      return { canvas: local, version: 8, updatedAt: "2026-09-25T02:00:00Z" };
    },
  });

  const saved = await saveWorkspaceCanvasWith(deps, "workspace-1", local, 3);

  assert.equal(saved.version, 8);
  assert.equal(calls.getCanvas, 1);
  assert.deepEqual(saved.canvas, local);
});

test("granular Canvas save retries merged state at the latest durable version", async () => {
  const local = canvas([{ id: "local", version: 1, versionNonce: 1, index: "a0" }]);
  const updates: Array<{ version: number; canvas: Snapshot }> = [];
  const { deps } = harness({
    updateCanvas: async (_workspaceId, value, version) => {
      updates.push({ version, canvas: value });
      if (updates.length === 1) throw new APIError(409, "conflict");
      return { canvas: value, version: version + 1, updatedAt: "2026-09-25T03:00:00Z" };
    },
    getCanvas: async () => ({
      canvas: canvas([{ id: "remote", version: 1, versionNonce: 2, index: "a1" }]),
      version: 6,
      updatedAt: "2026-09-25T02:00:00Z",
    }),
  });

  const saved = await saveWorkspaceCanvasWith(deps, "workspace-1", local, 2);

  assert.equal(updates.length, 2);
  assert.equal(updates[1]?.version, 6);
  assert.deepEqual(
    (updates[1]?.canvas.data.elements as Array<{ id: string }>).map((element) => element.id),
    ["local", "remote"],
  );
  assert.equal(saved.version, 7);
});

test("granular Canvas save publishes one recovery draft after three unresolved conflicts", async () => {
  let latestVersion = 4;
  const { conflicts, deps } = harness({
    updateCanvas: async () => { throw new APIError(409, "conflict"); },
    getCanvas: async () => {
      const value = {
        canvas: canvas([{ id: `remote-${latestVersion}`, version: 1, versionNonce: latestVersion, index: "a1" }]),
        version: latestVersion,
        updatedAt: "2026-09-25T04:00:00Z",
      };
      latestVersion += 1;
      return value;
    },
  });

  await assert.rejects(
    saveWorkspaceCanvasWith(
      deps,
      "workspace-1",
      canvas([{ id: "local", version: 1, versionNonce: 1, index: "a0" }]),
      2,
    ),
    GranularConflictError,
  );

  assert.equal(conflicts.length, 1);
  assert.equal((conflicts[0] as { kind: string }).kind, "canvas");
});
