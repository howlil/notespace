import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpTransport } from "./client.ts";
import { createWorkspaceHttpClient } from "./workspace-api.ts";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});


test("workspace client owns the Canvas route with optimistic concurrency headers", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return jsonResponse({});
    },
  };
  const client = createWorkspaceHttpClient(transport);
  const canvas = { format: "excalidraw", version: 1, data: { elements: [] } };

  await client.getWorkspaceCanvas("workspace/1");
  await client.updateWorkspaceCanvas("workspace/1", canvas, 5);

  assert.equal(calls[0]?.input, "/api/workspaces/workspace%2F1/canvas");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { canvas, version: 5 });
});

test("workspace client owns hierarchy queries, move/reparent, search encoding, Trash, and Workspace delete preconditions", async () => {
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

  await client.listChildWorkspaces("parent/1", {
    query: "system design",
    sort: "name",
    hasCanvas: true,
    offset: 25,
    limit: 50,
  });
  await client.listRootWorkspaces({ limit: 50, snapshot: "start" });
  await client.moveWorkspaceParent("workspace/1", null, "parent/1");
  await client.reparentWorkspaceChildren("parent/1", null);
  await client.searchNotespace("C++ / Go?");
  await client.deleteWorkspace("workspace/1", 8);
  await client.restoreTrashedWorkspace("workspace/1");
  await client.deleteTrashedWorkspace("workspace/1");

  assert.equal(
    calls[0]?.input,
    "/api/workspaces?parentId=parent%2F1&q=system+design&sort=name&hasCanvas=true&offset=25&limit=50",
  );
  assert.equal(calls[1]?.input, "/api/workspaces?rootOnly=true&snapshot=start&limit=50");
  assert.equal(calls[2]?.input, "/api/workspaces/workspace%2F1/parent");
  assert.equal(calls[2]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { parentId: null, expectedParentId: "parent/1" });
  assert.equal(calls[3]?.input, "/api/workspaces/parent%2F1/reparent-children");
  assert.equal(calls[3]?.init?.method, "POST");
  assert.equal(calls[4]?.input, "/api/search?q=C%2B%2B%20%2F%20Go%3F");
  assert.equal(calls[5]?.input, "/api/workspaces/workspace%2F1");
  assert.equal(new Headers(calls[5]?.init?.headers).get("If-Match"), `"8"`);
  assert.equal(calls[6]?.input, "/api/trash/workspace%2F1");
  assert.equal(calls[6]?.init?.method, "POST");
  assert.equal(calls[7]?.init?.method, "DELETE");
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
  assert.equal(new Headers(calls[1]?.init?.headers).get("Content-Type")?.split(";", 1)[0], "application/json");
});
