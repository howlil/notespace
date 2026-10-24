import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpTransport } from "./client.ts";
import { createCaptureHttpClient } from "./capture-api.ts";

test("Capture API owns its routes, versioned writes, and atomic organize payload", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return init?.method === "DELETE" ? new Response(null, { status: 204 }) :
        new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  };
  const client = createCaptureHttpClient(transport);
  await client.list();
  await client.create("hello **Markdown**");
  await client.update("item/a", 2, "Edited");
  await client.organize("item/a", {
    version: 3, workspaceId: "work/b", kind: "note",
    document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
  });
  await client.get("item/a");
  await client.remove("item/a", 4);
  assert.deepEqual(calls.map(({ input }) => input), [
    "/api/captures", "/api/captures", "/api/captures/item%2Fa",
    "/api/captures/item%2Fa/organize", "/api/captures/item%2Fa", "/api/captures/item%2Fa",
  ]);
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), {
    version: 3, workspaceId: "work/b", kind: "note",
    document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
  });
  assert.equal(new Headers(calls[5]?.init?.headers).get("If-Match"), '"4"');
});
