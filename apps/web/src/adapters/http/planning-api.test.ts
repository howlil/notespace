import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpTransport } from "./client.ts";
import { createPlanningHttpClient } from "./planning-api.ts";

test("Activity task handoff reads and updates its persisted Task by encoded ID and version", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ id: "task/a", version: 4 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
  const client = createPlanningHttpClient(transport);
  await client.getAnyTask("task/a");
  await client.updateAnyTask("task/a", { completed: true, version: 3 });

  assert.deepEqual(calls.map(({ input }) => input), ["/api/tasks/task%2Fa", "/api/tasks/task%2Fa"]);
  assert.equal(calls[0]?.init?.method, undefined);
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { completed: true, version: 3 });
});
