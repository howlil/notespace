import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpTransport } from "./client.ts";
import { createWorkspaceHttpClient } from "./workspace-api.ts";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("workspace client owns workspace-specific request methods over an injected transport", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const workspace = { id: "workspace-1", title: "Notes" };
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(workspace);
    },
  };
  const client = createWorkspaceHttpClient(transport);

  assert.deepEqual(await client.getWorkspace("workspace/1"), workspace);
  await client.updateWorkspaceSnapshot("workspace/1", {
    title: "Notes",
    document: { format: "tiptap", version: 1, data: {} },
    notes: [],
    canvas: { format: "excalidraw", version: 1, data: {} },
    references: [],
    splitRatio: 0.5,
  }, 7);

  assert.equal(calls[0]?.input, "/api/workspaces/workspace%2F1");
  assert.equal(calls[1]?.input, "/api/workspaces/workspace%2F1");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.equal(
    calls[1]?.init?.headers && new Headers(calls[1].init.headers).get("Content-Type"),
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    title: "Notes",
    document: { format: "tiptap", version: 1, data: {} },
    notes: [],
    canvas: { format: "excalidraw", version: 1, data: {} },
    references: [],
    splitRatio: 0.5,
    version: 7,
  });
});


test("workspace client owns Note and Canvas routes with optimistic concurrency headers", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return jsonResponse({});
    },
  };
  const client = createWorkspaceHttpClient(transport);
  const snapshot = { format: "tiptap", version: 1, data: {} };
  const canvas = { format: "excalidraw", version: 1, data: { elements: [] } };

  await client.createWorkspaceNote("workspace/1", { id: "note/1", title: "Note", document: snapshot });
  await client.updateWorkspaceNote("workspace/1", "note/1", { title: "Updated", document: snapshot, version: 3 });
  await client.deleteWorkspaceNote("workspace/1", "note/1", 4);
  await client.getWorkspaceCanvas("workspace/1");
  await client.updateWorkspaceCanvas("workspace/1", canvas, 5);

  assert.equal(calls[0]?.input, "/api/workspaces/workspace%2F1/notes");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[1]?.input, "/api/workspaces/workspace%2F1/notes/note%2F1");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    title: "Updated",
    document: snapshot,
    version: 3,
  });
  assert.equal(calls[2]?.init?.method, "DELETE");
  assert.equal(new Headers(calls[2]?.init?.headers).get("If-Match"), `"4"`);
  assert.equal(calls[3]?.input, "/api/workspaces/workspace%2F1/canvas");
  assert.equal(calls[4]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[4]?.init?.body)), { canvas, version: 5 });
});

test("workspace client owns category queries, search encoding, Trash, and Workspace delete preconditions", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).startsWith("/api/search")) return jsonResponse([]);
      if (String(input).includes("/workspaces?")) return jsonResponse({ items: [], total: 0, offset: 0, limit: 50 });
      return jsonResponse({});
    },
  };
  const client = createWorkspaceHttpClient(transport);

  await client.listCategoryWorkspaces("category/1", {
    query: "system design",
    sort: "name",
    hasCanvas: true,
    hasNotes: true,
    offset: 25,
    limit: 50,
  });
  await client.searchNotespace("C++ / Go?");
  await client.deleteWorkspace("workspace/1", 8);
  await client.restoreTrashedWorkspace("workspace/1");
  await client.deleteTrashedWorkspace("workspace/1");

  assert.equal(
    calls[0]?.input,
    "/api/categories/category%2F1/workspaces?q=system+design&sort=name&hasCanvas=true&hasNotes=true&offset=25&limit=50",
  );
  assert.equal(calls[1]?.input, "/api/search?q=C%2B%2B%20%2F%20Go%3F");
  assert.equal(calls[2]?.input, "/api/workspaces/workspace%2F1");
  assert.equal(new Headers(calls[2]?.init?.headers).get("If-Match"), `"8"`);
  assert.equal(calls[3]?.input, "/api/trash/workspace%2F1");
  assert.equal(calls[3]?.init?.method, "POST");
  assert.equal(calls[4]?.init?.method, "DELETE");
});

test("workspace client restores ZIP and JSON backups with explicit media types", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return new Response(null, { status: 204 });
    },
  };
  const client = createWorkspaceHttpClient(transport);

  await client.restoreLibraryBackup(new File(["zip"], "backup.zip", { type: "application/octet-stream" }));
  await client.restoreLibraryBackup(new File(["{}"], "backup.json", { type: "application/json" }));

  assert.equal(calls[0]?.input, "/api/backup/restore");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(new Headers(calls[0]?.init?.headers).get("Content-Type"), "application/zip");
  assert.equal(new Headers(calls[1]?.init?.headers).get("Content-Type"), "application/json");
});
