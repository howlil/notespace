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
