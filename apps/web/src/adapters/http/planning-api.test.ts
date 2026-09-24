import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpTransport } from "./client.ts";
import { createPlanningHttpClient } from "./planning-api.ts";

const response = (body: unknown = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

test("planning client serializes workspace task routes and versioned delete preconditions", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return response({});
    },
  };
  const client = createPlanningHttpClient(transport);

  await client.createTask("workspace/a", "Test", "milestone/b");
  await client.updateTask("workspace/a", "task/c", { title: "Updated", version: 4 });
  await client.deleteTask("workspace/a", "task/c", 5);

  assert.equal(calls[0]?.input, "/api/workspaces/workspace%2Fa/tasks");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { title: "Test", milestoneId: "milestone/b" });

  assert.equal(calls[1]?.input, "/api/workspaces/workspace%2Fa/tasks/task%2Fc");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { title: "Updated", version: 4 });

  assert.equal(calls[2]?.init?.method, "DELETE");
  assert.equal(new Headers(calls[2]?.init?.headers).get("If-Match"), '"5"');
});

test("planning client owns Today, Inbox, and standalone task routes", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return response({});
    },
  };
  const client = createPlanningHttpClient(transport);

  await client.getToday("2026-09-24");
  await client.getInbox();
  await client.createStandaloneTask("Read", "2026-09-25");
  await client.deleteAnyTask("task/a", 3);

  assert.equal(calls[0]?.input, "/api/tasks/today?date=2026-09-24");
  assert.equal(calls[1]?.input, "/api/tasks/inbox");
  assert.equal(calls[2]?.input, "/api/tasks");
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { title: "Read", plannedFor: "2026-09-25" });
  assert.equal(calls[3]?.input, "/api/tasks/task%2Fa");
  assert.equal(new Headers(calls[3]?.init?.headers).get("If-Match"), '"3"');
});
