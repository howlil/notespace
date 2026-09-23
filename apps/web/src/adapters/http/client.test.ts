import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APIError,
  createWorkspaceHttpClient,
  request,
  type HttpTransport,
} from "./client";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("uses an injected transport while preserving project request methods", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const project = { id: "workspace-1", title: "Notes" };
  const transport: HttpTransport = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(project);
    },
  };
  const client = createWorkspaceHttpClient(transport);

  assert.deepEqual(await client.getWorkspace("workspace/1"), project);
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
  assert.equal(calls[1]?.init?.headers && new Headers(calls[1].init.headers).get("Content-Type"), "application/json");
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

test("maps a non-2xx JSON error response to APIError", async () => {
  const transport: HttpTransport = {
    fetch: async () => jsonResponse({ error: "Workspace conflict", code: "workspace_conflict" }, 409),
  };

  await assert.rejects(
    request("/api/workspaces/workspace-1", undefined, transport),
    (error: unknown) => {
      assert.ok(error instanceof APIError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "Workspace conflict");
      assert.equal(error.code, "workspace_conflict");
      return true;
    },
  );
});

test("maps a non-2xx malformed body to a generic APIError", async () => {
  const transport: HttpTransport = {
    fetch: async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError("malformed JSON"); },
    } as unknown as Response),
  };

  await assert.rejects(
    request("/api/unavailable", undefined, transport),
    (error: unknown) => {
      assert.ok(error instanceof APIError);
      assert.equal(error.status, 502);
      assert.equal(error.message, "Unable to reach Notespace. Please retry.");
      return true;
    },
  );
});

test("returns undefined for 204 without decoding a body", async () => {
  const transport: HttpTransport = {
    fetch: async () => ({
      ok: true,
      status: 204,
      json: async () => { throw new Error("204 body must not be decoded"); },
    } as unknown as Response),
  };

  assert.equal(await request<void>("/api/workspaces/workspace-1", undefined, transport), undefined);
});

test("preserves a caller signal and supplies the default timeout signal", async () => {
  let receivedInit: RequestInit | undefined;
  const transport: HttpTransport = {
    fetch: async (_input, init) => {
      receivedInit = init;
      return jsonResponse({ ok: true });
    },
  };
  const controller = new AbortController();

  await request("/api/with-signal", { signal: controller.signal }, transport);
  assert.equal(receivedInit?.signal, controller.signal);

  await request("/api/with-timeout", undefined, transport);
  assert.ok(receivedInit?.signal instanceof AbortSignal);
  assert.equal(receivedInit?.signal?.aborted, false);
});

test("propagates malformed JSON from a successful response", async () => {
  const transport: HttpTransport = {
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError("malformed JSON"); },
    } as unknown as Response),
  };

  await assert.rejects(
    request("/api/malformed", undefined, transport),
    (error: unknown) => error instanceof SyntaxError && error.message === "malformed JSON",
  );
});
