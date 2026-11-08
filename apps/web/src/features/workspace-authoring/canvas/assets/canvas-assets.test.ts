import assert from "node:assert/strict";
import { test } from "node:test";
import { PendingCanvasAssetWrites, persistCanvasAsset } from "./canvas-assets.ts";
import type { LocalImageAsset } from "../../../../adapters/assets/image-types.ts";

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

test("PendingCanvasAssetWrites waits for every owned write", async () => {
  const writes = new PendingCanvasAssetWrites();
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const second = new Promise<void>((resolve) => { releaseSecond = resolve; });

  writes.track("first", async () => first);
  writes.track("second", async () => second);
  const flushed = writes.flush();
  assert.equal(writes.hasPending, true);
  releaseFirst();
  await Promise.resolve();
  assert.equal(writes.hasPending, true);
  releaseSecond();
  await flushed;
  assert.equal(writes.hasPending, false);
});

test("PendingCanvasAssetWrites deduplicates and retains failed writes for retry", async () => {
  const writes = new PendingCanvasAssetWrites();
  let attempts = 0;
  const task = writes.track("asset", async () => {
    attempts += 1;
    throw new Error("upload failed");
  });
  assert.equal(writes.track("asset", async () => undefined), task);
  await assert.rejects(task, /upload failed/);
  assert.equal(writes.hasPending, true);
  await writes.track("asset", async () => { attempts += 1; });
  assert.equal(attempts, 2);
  assert.equal(writes.hasPending, false);
});

test("a failed upload still blocks a later flush until its retry succeeds", async () => {
  const writes = new PendingCanvasAssetWrites();
  let fail = true;
  await assert.rejects(writes.track("image", async () => {
    if (fail) throw new Error("upload failed");
  }), /upload failed/);
  await assert.rejects(writes.flush(), /upload failed/);
  assert.equal(writes.hasPending, true);
  fail = false;
  await writes.flush();
  assert.equal(writes.hasPending, false);
});

test("removing a failed image lets the remaining Canvas be saved", async () => {
  const writes = new PendingCanvasAssetWrites();
  writes.retain(new Set(["image"]));
  await assert.rejects(writes.track("image", async () => { throw new Error("upload failed"); }));
  writes.retain(new Set());
  await writes.flush();
  assert.equal(writes.hasPending, false);
});
