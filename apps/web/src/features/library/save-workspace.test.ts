import assert from "node:assert/strict";
import { test } from "node:test";
import { APIError } from "../../adapters/http/client.ts";
import {
  saveWorkspaceWith,
  WorkspaceConflictError,
  type SaveWorkspaceDependencies,
} from "./save-workspace.ts";
import type { Snapshot, Workspace, WorkspaceContent } from "../../domain/workspace/workspace.ts";

function document(text = ""): Snapshot {
  return {
    format: "tiptap",
    version: 1,
    data: {
      type: "doc",
      content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }],
    },
  };
}

function canvas(ids: string[] = []): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: {
      elements: ids.map((id, index) => ({
        id,
        type: "rectangle",
        version: 1,
        versionNonce: index + 1,
        index: `a${index}`,
      })),
      appState: {},
      files: {},
    },
  };
}

function content(overrides: Partial<WorkspaceContent> = {}): WorkspaceContent {
  const doc = document();
  return {
    title: "Workspace",
    document: doc,
    notes: [{
      id: "note-1",
      title: "Untitled",
      document: doc,
      createdAt: "2026-09-25T00:00:00Z",
      updatedAt: "2026-09-25T00:00:00Z",
      version: 1,
    }],
    canvas: canvas(),
    references: [],
    splitRatio: 0.45,
    ...overrides,
  };
}

function workspace(value: WorkspaceContent, version = 2): Workspace {
  return {
    id: "workspace-1",
    categoryId: "legacy",
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
    version,
    noteCount: value.notes.length,
    hasCanvas: (value.canvas.data.elements as unknown[]).length > 0,
    canvasVersion: version,
    ...value,
  };
}

function harness(overrides: Partial<SaveWorkspaceDependencies> = {}) {
  const calls = {
    updates: [] as Array<{ content: WorkspaceContent; version: number }>,
    gets: 0,
    conflicts: 0,
    reconciles: 0,
  };
  const deps: SaveWorkspaceDependencies = {
    update: async (_id, value, version) => {
      calls.updates.push({ content: value, version });
      return workspace(value, version + 1);
    },
    getLatest: async () => {
      calls.gets += 1;
      return workspace(content(), 4);
    },
    publishConflict: () => { calls.conflicts += 1; },
    reconcileAssets: () => { calls.reconciles += 1; },
    ...overrides,
  };
  return { calls, deps };
}

test("saveWorkspaceWith saves once on the happy path", async () => {
  const local = content();
  const { calls, deps } = harness();
  const saved = await saveWorkspaceWith(deps, "workspace-1", local, 3);

  assert.equal(saved.version, 4);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0]?.version, 3);
  assert.equal(calls.gets, 0);
  assert.equal(calls.reconciles, 1);
});

test("saveWorkspaceWith accepts latest state when the stale candidate already converged", async () => {
  const local = content({ title: "Converged" });
  const latest = workspace(local, 5);
  let updates = 0;
  const { calls, deps } = harness({
    update: async () => {
      updates += 1;
      throw new APIError(409, "conflict");
    },
    getLatest: async () => {
      calls.gets += 1;
      return latest;
    },
  });

  assert.equal(await saveWorkspaceWith(deps, "workspace-1", local, 3), latest);
  assert.equal(updates, 1);
  assert.equal(calls.gets, 1);
  assert.equal(calls.reconciles, 1);
});

test("saveWorkspaceWith rebases independent remote fields and retries at the latest version", async () => {
  const base = content();
  const local = content({ canvas: canvas(["local"]) });
  const latestContent = content({ title: "Renamed remotely" });
  const latest = workspace(latestContent, 7);
  const updates: Array<{ value: WorkspaceContent; version: number }> = [];

  const { deps } = harness({
    update: async (_id, value, version) => {
      updates.push({ value, version });
      if (updates.length === 1) throw new APIError(409, "conflict");
      return workspace(value, version + 1);
    },
    getLatest: async () => latest,
  });

  const saved = await saveWorkspaceWith(deps, "workspace-1", local, 3, base);
  assert.equal(updates.length, 2);
  assert.equal(updates[1]?.version, 7);
  assert.equal(updates[1]?.value.title, "Renamed remotely");
  assert.deepEqual(
    (updates[1]?.value.canvas.data.elements as Array<{ id: string }>).map((element) => element.id),
    ["local"],
  );
  assert.equal(saved.version, 8);
});

test("saveWorkspaceWith merges independent Canvas edits when no acknowledged base is available", async () => {
  const local = content({ canvas: canvas(["local"]) });
  const latest = workspace(content({ canvas: canvas(["remote"]) }), 6);
  const updates: Array<{ value: WorkspaceContent; version: number }> = [];

  const { deps } = harness({
    update: async (_id, value, version) => {
      updates.push({ value, version });
      if (updates.length === 1) throw new APIError(409, "conflict");
      return workspace(value, version + 1);
    },
    getLatest: async () => latest,
  });

  await saveWorkspaceWith(deps, "workspace-1", local, 2);
  assert.equal(updates[1]?.version, 6);
  assert.deepEqual(
    (updates[1]?.value.canvas.data.elements as Array<{ id: string }>).map((element) => element.id).sort(),
    ["local", "remote"],
  );
});

test("saveWorkspaceWith publishes and blocks true same-field conflicts", async () => {
  const base = content();
  const local = content({ title: "Local title" });
  const latest = workspace(content({ title: "Remote title" }), 4);
  const published: unknown[] = [];

  const { deps } = harness({
    update: async () => { throw new APIError(409, "conflict"); },
    getLatest: async () => latest,
    publishConflict: (draft) => { published.push(draft); },
  });

  await assert.rejects(
    saveWorkspaceWith(deps, "workspace-1", local, 2, base),
    WorkspaceConflictError,
  );
  assert.equal(published.length, 1);
});

test("saveWorkspaceWith stops after three unresolved Canvas conflicts", async () => {
  const local = content({ canvas: canvas(["local"]) });
  let latestVersion = 3;
  let updateCalls = 0;
  let conflicts = 0;
  const { deps } = harness({
    update: async () => {
      updateCalls += 1;
      throw new APIError(409, "conflict");
    },
    getLatest: async () => {
      const latest = workspace(content({ canvas: canvas([`remote-${latestVersion}`]) }), latestVersion);
      latestVersion += 1;
      return latest;
    },
    publishConflict: () => { conflicts += 1; },
  });

  await assert.rejects(
    saveWorkspaceWith(deps, "workspace-1", local, 2),
    WorkspaceConflictError,
  );
  assert.equal(updateCalls, 3);
  assert.equal(conflicts, 1);
});
