import assert from "node:assert/strict";
import test from "node:test";
import { APIError, type HttpTransport } from "./client.ts";
import { fetchEraserIcon } from "./eraser-icon-api.ts";

test("fetchEraserIcon keeps the icon gateway behind the HTTP adapter", async () => {
  let requestedUrl = "";
  const transport: HttpTransport = {
    fetch: async (input) => {
      requestedUrl = String(input);
      return new Response("<svg />", { status: 200, headers: { "Content-Type": "image/svg+xml" } });
    },
  };

  const result = await fetchEraserIcon("aws s3", transport);

  assert.equal(requestedUrl, "/api/icons/eraser/aws%20s3");
  assert.equal(await result.text(), "<svg />");
});

test("fetchEraserIcon translates gateway failures into APIError", async () => {
  const transport: HttpTransport = {
    fetch: async () => new Response(JSON.stringify({ error: "Icon unavailable", code: "ICON_MISSING" }), { status: 404 }),
  };

  await assert.rejects(fetchEraserIcon("missing", transport), (error: unknown) => {
    assert.ok(error instanceof APIError);
    assert.equal(error.status, 404);
    assert.equal(error.code, "ICON_MISSING");
    return true;
  });
});
