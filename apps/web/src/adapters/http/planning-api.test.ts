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

test("planning client owns Today, legacy Inbox reads, and Task assignment", async () => {
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
  await client.getUnassignedTasks();
  await client.assignStandaloneTask("task/a", "workspace/1", 2);
  await client.deleteAnyTask("task/a", 3);

  assert.equal(calls[0]?.input, "/api/tasks/today?date=2026-09-24");
  assert.equal(calls[1]?.input, "/api/tasks/inbox");
  assert.equal(calls[2]?.input, "/api/tasks/unassigned");
  assert.equal(calls[3]?.input, "/api/tasks/task%2Fa/assign-workspace");
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { workspaceId: "workspace/1", version: 2 });
  assert.equal(calls[4]?.input, "/api/tasks/task%2Fa");
  assert.equal(new Headers(calls[4]?.init?.headers).get("If-Match"), '"3"');
});

test("planning client sends the caller's stable idempotency key for both create routes", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = { fetch: async (input, init) => {
    calls.push({ input, init });
    return response({ id: "persisted" });
  } };
  const client = createPlanningHttpClient(transport);
  await client.createTask("workspace/a", "Stable task", undefined, "2026-10-26", "client-task-key");
  await client.createMilestone("workspace/a", "Stable milestone", "client-milestone-key");
  assert.equal(new Headers(calls[0]?.init?.headers).get("Idempotency-Key"), "client-task-key");
  assert.equal(new Headers(calls[1]?.init?.headers).get("Idempotency-Key"), "client-milestone-key");
  assert.equal(new Headers(calls[0]?.init?.headers).get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { title: "Stable task", plannedFor: "2026-10-26" });
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { title: "Stable milestone" });
});
