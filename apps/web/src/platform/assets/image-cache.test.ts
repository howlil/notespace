import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMemoryImageAsset,
  imageCacheKey,
  clearLocalImageCache,
  createMemoryImageCache,
  imageCacheEvictions,
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

test("clearing a deleted workspace never removes another workspace cache", async () => {
  const workspaceA = `prune-a-${Date.now()}`;
  const workspaceB = `prune-b-${Date.now()}`;
  await putLocalImageCache(asset(workspaceA, "keep"));
  await putLocalImageCache(asset(workspaceA, "drop"));
  await putLocalImageCache(asset(workspaceB, "drop"));

  await clearLocalImageCache(workspaceA);

  assert.equal(await readLocalImageCache(workspaceA, "keep"), null);
  assert.equal(await readLocalImageCache(workspaceA, "drop"), null);
  assert.ok(await readLocalImageCache(workspaceB, "drop"));
});

test("memory cache evicts the least recently read entry and respects its count limit", () => {
  const cache = createMemoryImageCache(100, 2);
  cache.put(asset("w", "first"));
  cache.put(asset("w", "second"));
  assert.ok(cache.get("w", "first"));
  cache.put(asset("w", "third"));
  assert.equal(cache.get("w", "second"), null);
  assert.ok(cache.get("w", "first"));
  assert.ok(cache.get("w", "third"));
});

test("memory cache accounts for replacements and rejects oversized blobs", () => {
  const cache = createMemoryImageCache(10, 10);
  const record = (id: string, bytes: number) => ({ ...asset("w", id), blob: new Blob([new Uint8Array(bytes)]) });
  cache.put(record("a", 6));
  cache.put(record("a", 2));
  cache.put(record("b", 8));
  assert.ok(cache.get("w", "a"));
  assert.ok(cache.get("w", "b"));
  cache.put(record("c", 11));
  assert.equal(cache.get("w", "c"), null);
  cache.put(record("d", 3));
  assert.equal(cache.get("w", "a"), null);
  assert.equal(cache.get("w", "b"), null);
  assert.ok(cache.get("w", "d"));
});

test("disk eviction removes oldest confirmed copies while protecting unknown legacy records", () => {
  const records = [
    { key: "legacy", bytes: 10, lastAccessedAt: 0 },
    { key: "recent", bytes: 6, confirmedAt: 1, lastAccessedAt: 3 },
    { key: "old", bytes: 6, confirmedAt: 1, lastAccessedAt: 2 },
  ];
  assert.deepEqual(imageCacheEvictions(records, 16), ["old"]);
  assert.deepEqual(imageCacheEvictions(records, 1), ["old", "recent"]);
});
