import assert from "node:assert/strict";
import test from "node:test";
import type { Workspace } from "../../domain/workspace/workspace";
import { importVaultFiles, type VaultImportOperations } from "./vault-import-workflow";

test("vault import workflow can run with injected operations", async () => {
  const snapshot = { format: "tiptap", version: 1, data: { type: "doc", content: [] } };
  const project = {
    id: "workspace-1",
    categoryId: "category-1",
    title: "Seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    document: snapshot,
    notes: [{ id: "note-1", title: "Untitled", document: snapshot, createdAt: snapshot.format, updatedAt: snapshot.format, version: 1 }],
    canvas: snapshot,
    canvasVersion: 1,
    references: [],
    splitRatio: 0.5,
  } satisfies Workspace;
  const saved: string[] = [];
  const operations: VaultImportOperations = {
    createWorkspace: async () => project,
    deleteWorkspace: async () => {},
    deleteTrashedWorkspace: async () => {},
    saveWorkspace: async (_id, content) => { saved.push(content.title); },
    createLocalAssetId: () => "asset-1",
    storeImageAsset: async () => {},
  };
  const markdown = { name: "note.md", type: "text/markdown", webkitRelativePath: "vault/note.md", text: async () => "# Imported note" } as unknown as File;

  const result = await importVaultFiles([markdown], "category-1", operations);

  assert.deepEqual(result, { imported: 1, failed: 0, cleanupFailed: 0 });
  assert.deepEqual(saved, ["Imported note"]);
});
