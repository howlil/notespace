import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageApi } from "./image-api.ts";

test("image API encodes asset identity and preserves MIME on upload", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const api = createImageApi(async (input, init) => {
    calls.push({ input, init });
    return new Response(null, { status: 204 });
  });

  const accepted = await api.uploadRemoteImageAsset(
    "workspace/a",
    "asset b",
    new Blob(["image"], { type: "image/png" }),
  );

  assert.equal(accepted, true);
  assert.equal(calls[0]?.input, "/api/workspaces/workspace%2Fa/assets/asset%20b");
  assert.equal(calls[0]?.init?.method, "PUT");
  assert.equal(new Headers(calls[0]?.init?.headers).get("Content-Type"), "image/png");
});

test("image API maps missing ownership without turning it into an exception", async () => {
  const api = createImageApi(async () => new Response(null, { status: 404 }));

  assert.equal(
    await api.uploadRemoteImageAsset("workspace-1", "asset-1", new Blob(["x"], { type: "image/png" })),
    false,
  );
  assert.equal(await api.loadRemoteImageAsset("workspace-1", "asset-1"), null);
});

test("image upload surfaces server error messages", async () => {
  const api = createImageApi(async () => new Response(
    JSON.stringify({ error: "Asset rejected" }),
    { status: 413, headers: { "Content-Type": "application/json" } },
  ));

  await assert.rejects(
    api.uploadRemoteImageAsset("workspace-1", "asset-1", new Blob(["x"], { type: "image/png" })),
    /Asset rejected/,
  );
});

test("image load returns durable metadata from response headers", async () => {
  const api = createImageApi(async () => new Response(
    new Blob(["image"], { type: "image/webp" }),
    {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "X-Notespace-Created-At": "2026-09-25T05:00:00Z",
      },
    },
  ));

  const asset = await api.loadRemoteImageAsset("workspace-1", "asset-1");
  assert.ok(asset);
  assert.equal(asset.id, "asset-1");
  assert.equal(asset.workspaceId, "workspace-1");
  assert.equal(asset.mimeType, "image/webp");
  assert.equal(asset.createdAt, Date.parse("2026-09-25T05:00:00Z"));
});

test("image load falls back to a finite current timestamp for invalid metadata", async () => {
  const before = Date.now();
  const api = createImageApi(async () => new Response(
    new Blob(["image"], { type: "image/png" }),
    {
      status: 200,
      headers: { "X-Notespace-Created-At": "invalid-date" },
    },
  ));

  const asset = await api.loadRemoteImageAsset("workspace-1", "asset-1");
  const after = Date.now();
  assert.ok(asset);
  assert.equal(Number.isFinite(asset.createdAt), true);
  assert.equal(asset.createdAt >= before && asset.createdAt <= after, true);
});
