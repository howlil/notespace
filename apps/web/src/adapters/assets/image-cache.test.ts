import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMemoryImageAsset,
  imageCacheKey,
  pruneLocalImageCache,
  putLocalImageCache,
  readLocalImageCache,
  removeLocalImageCache,
} from "./image-cache.ts";
import type { LocalImageAsset } from "./image-types.ts";

function asset(workspaceId: string, id: string): LocalImageAsset {
  return {
    workspaceId,
    id,
    blob: new Blob([`${workspaceId}:${id}`], { type: "image/png" }),
    mimeType: "image/png",
    createdAt: 1,
  };
}

test("image cache keys isolate the same asset ID across workspaces", async () => {
  const workspaceA = `cache-a-${Date.now()}`;
  const workspaceB = `cache-b-${Date.now()}`;
  await putLocalImageCache(asset(workspaceA, "same"));
  await putLocalImageCache(asset(workspaceB, "same"));

  assert.notEqual(imageCacheKey(workspaceA, "same"), imageCacheKey(workspaceB, "same"));
  assert.equal(getMemoryImageAsset(workspaceA, "same")?.workspaceId, workspaceA);
  assert.equal(getMemoryImageAsset(workspaceB, "same")?.workspaceId, workspaceB);

  await removeLocalImageCache(workspaceA, "same");
  assert.equal(getMemoryImageAsset(workspaceA, "same"), null);
  assert.equal(getMemoryImageAsset(workspaceB, "same")?.workspaceId, workspaceB);
});

test("pruning one workspace never removes another workspace cache", async () => {
  const workspaceA = `prune-a-${Date.now()}`;
  const workspaceB = `prune-b-${Date.now()}`;
  await putLocalImageCache(asset(workspaceA, "keep"));
  await putLocalImageCache(asset(workspaceA, "drop"));
  await putLocalImageCache(asset(workspaceB, "drop"));

  await pruneLocalImageCache(workspaceA, new Set(["keep"]));

  assert.ok(await readLocalImageCache(workspaceA, "keep"));
  assert.equal(await readLocalImageCache(workspaceA, "drop"), null);
  assert.ok(await readLocalImageCache(workspaceB, "drop"));
});
