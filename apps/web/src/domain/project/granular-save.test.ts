import assert from "node:assert/strict";
import test from "node:test";
import { GranularConflictError, saveWorkspaceCanvas, saveWorkspaceNote } from "./granular-save.ts";
import type { Project, Snapshot } from "./project.ts";

function canvas(elements: Array<Record<string, unknown>>): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: { elements, appState: {}, files: {} },
  };
}

function projectWithCanvas(value: Snapshot, canvasVersion: number): Project {
  return {
    id: "workspace-1",
    categoryId: "category-1",
    title: "Workspace",
    createdAt: "2026-09-19T00:00:00Z",
    updatedAt: "2026-09-19T00:00:01Z",
    version: 7,
    noteCount: 1,
    hasCanvas: true,
    document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
    notes: [{
      id: "note-1",
      title: "Note",
      document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
      createdAt: "2026-09-19T00:00:00Z",
      updatedAt: "2026-09-19T00:00:00Z",
      version: 1,
    }],
    canvas: value,
    canvasVersion,
    references: [],
    splitRatio: 0.45,
  };
}

test("Canvas conflict fetches latest state, merges Excalidraw elements, and retries with the latest version", async () => {
  const originalFetch = globalThis.fetch;
  const local = canvas([{ id: "shared", type: "rectangle", version: 2, versionNonce: 10, x: 20 }]);
  const remote = canvas([
    { id: "shared", type: "rectangle", version: 1, versionNonce: 20, x: 5 },
    { id: "remote-only", type: "ellipse", version: 1, versionNonce: 30 },
  ]);
  let call = 0;
  let retryBody: { canvas: Snapshot; version: number } | undefined;

  globalThis.fetch = async (_input, init) => {
    call += 1;
    if (call === 1) {
      assert.equal(init?.method, "PATCH");
      return new Response(JSON.stringify({ error: "conflict", code: "workspace_conflict" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (call === 2) {
      return new Response(JSON.stringify(projectWithCanvas(remote, 4)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    retryBody = JSON.parse(String(init?.body)) as { canvas: Snapshot; version: number };
    return new Response(JSON.stringify({
      canvas: retryBody.canvas,
      version: 5,
      updatedAt: "2026-09-19T00:00:02Z",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const saved = await saveWorkspaceCanvas("workspace-1", local, 1);
    assert.equal(call, 3);
    assert.equal(retryBody?.version, 4);
    const elements = retryBody?.canvas.data.elements as Array<Record<string, unknown>>;
    assert.equal(elements.length, 2);
    assert.equal(elements.find((element) => element.id === "shared")?.x, 20);
    assert.equal(elements.some((element) => element.id === "remote-only"), true);
    assert.equal(saved.version, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Note conflicts stay blocking instead of silently merging document content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "conflict" }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });

  try {
    await assert.rejects(
      saveWorkspaceNote(
        "workspace-1",
        "note-1",
        {
          title: "Local",
          document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
        },
        2,
      ),
      (error: unknown) => error instanceof GranularConflictError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
