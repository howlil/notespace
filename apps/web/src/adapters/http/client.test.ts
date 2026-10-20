import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APIError,
  request,
  type HttpTransport,
} from "./client.ts";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
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

// Use the production transport to prove that HTTP status validation is inside
// desktop's outstanding-write barrier. A mocked HttpTransport alone bypasses
// that boundary.
test("desktop flush rejects HTTP mutation errors including 409 and 500", async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __TAURI_INTERNALS__: {} },
  });
  try {
    const { flushDesktopState } = await import("../browser/desktop-lifecycle.ts");
    for (const status of [409, 500]) {
      let respond!: (response: Response) => void;
      globalThis.fetch = () => new Promise<Response>((resolve) => { respond = resolve; });
      const mutationResult = request("/api/workspaces/a", {
        method: "PATCH",
        body: "{}",
      }).then(() => null, error => error);
      const flushResult = flushDesktopState().then(() => null, error => error);
      respond(jsonResponse({ error: "Save rejected" }, status));
      const mutationError = await mutationResult;
      assert.ok(mutationError instanceof APIError);
      assert.equal(mutationError.status, status);
      const flushError = await flushResult;
      assert.ok(flushError instanceof APIError);
      assert.equal(flushError.status, status);
    }
    await flushDesktopState();
  } finally {
    globalThis.fetch = previousFetch;
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
