import assert from "node:assert/strict";
import { test } from "node:test";
import { persistCanvasAsset } from "./canvas-assets.ts";
import type { LocalImageAsset } from "../../../adapters/assets/image-types.ts";

function asset(): LocalImageAsset {
  return {
    id: "asset-1",
    workspaceId: "workspace-1",
    blob: new Blob(["image"], { type: "image/png" }),
    mimeType: "image/png",
    createdAt: 1,
  };
}

test("persistCanvasAsset returns the durable asset when upload is accepted", async () => {
  const stored = asset();
  const result = await persistCanvasAsset(
    "workspace-1",
    "asset-1",
    "data:image/png;base64,eA==",
    {
      blobFromDataUrl: async () => new Blob(["image"], { type: "image/png" }),
      storeImageAsset: async () => stored,
    },
  );
  assert.equal(result, stored);
});

test("persistCanvasAsset preserves ownership rejection as null", async () => {
  const result = await persistCanvasAsset(
    "workspace-1",
    "asset-1",
    "data:image/png;base64,eA==",
    {
      blobFromDataUrl: async () => new Blob(["image"], { type: "image/png" }),
      storeImageAsset: async () => null,
    },
  );
  assert.equal(result, null);
});

test("persistCanvasAsset propagates decoding and storage failures", async () => {
  await assert.rejects(
    persistCanvasAsset("workspace-1", "asset-1", "bad", {
      blobFromDataUrl: async () => { throw new Error("decode failed"); },
      storeImageAsset: async () => asset(),
    }),
    /decode failed/,
  );
  await assert.rejects(
    persistCanvasAsset("workspace-1", "asset-1", "data:image/png;base64,eA==", {
      blobFromDataUrl: async () => new Blob(["image"], { type: "image/png" }),
      storeImageAsset: async () => { throw new Error("store failed"); },
    }),
    /store failed/,
  );
});
