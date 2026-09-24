import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpTransport } from "./client.ts";
import { createActivityHttpClient } from "./activity-api.ts";

const response = (body: unknown = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

test("activity client serializes heartbeat and session identity", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return response({});
    },
  };
  const client = createActivityHttpClient(transport);
  const heartbeat = {
    activityDate: "2026-09-24",
    activeSeconds: 120,
    finish: false,
    title: "Build",
    activityType: "build" as const,
  };

  await client.recordActivityHeartbeat("session/a", heartbeat);

  assert.equal(calls[0]?.input, "/api/activity/sessions/session%2Fa");
  assert.equal(calls[0]?.init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), heartbeat);
});

test("activity client owns query encoding and delete route", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return response({});
    },
  };
  const client = createActivityHttpClient(transport);

  await client.listActivitySessions(25);
  await client.getActivityStats("2026-09-24");
  await client.getActivitySummary("2026-09-01", "2026-09-24");
  await client.getActivityDayDetail("2026-09-24");
  await client.deleteActivitySession("session/a");

  assert.equal(calls[0]?.input, "/api/activity/sessions?limit=25");
  assert.equal(calls[1]?.input, "/api/activity/stats?date=2026-09-24");
  assert.equal(calls[2]?.input, "/api/activity?from=2026-09-01&to=2026-09-24");
  assert.equal(calls[3]?.input, "/api/activity/2026-09-24");
  assert.equal(calls[4]?.input, "/api/activity/sessions/session%2Fa");
  assert.equal(calls[4]?.init?.method, "DELETE");
});
