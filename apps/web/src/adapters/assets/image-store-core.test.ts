import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageStore, type ImageStoreDependencies } from "./image-store-core.ts";
import type { LocalImageAsset } from "./image-types.ts";

function asset(id = "asset-1"): LocalImageAsset {
  return {
    id,
    workspaceId: "workspace-1",
    blob: new Blob(["image"], { type: "image/png" }),
    mimeType: "image/png",
    createdAt: 1,
  };
}

function harness(overrides: Partial<ImageStoreDependencies> = {}) {
  const calls = {
    remoteLoads: 0,
    uploads: 0,
    localReads: 0,
    localPuts: 0,
    localRemoves: 0,
  };
  const deps: ImageStoreDependencies = {
    normalize: async (source) => source,
    uploadRemote: async () => { calls.uploads += 1; return true; },
    loadRemote: async () => { calls.remoteLoads += 1; return null; },
    getMemory: () => null,
    putLocal: async () => { calls.localPuts += 1; },
    readLocal: async () => { calls.localReads += 1; return null; },
    removeLocal: async () => { calls.localRemoves += 1; },
    cacheKey: (workspaceId, id) => `${workspaceId}:${id}`,
    now: () => 123,
    ...overrides,
  };
  return { calls, store: createImageStore(deps) };
}

test("loadImageAsset returns memory hit without remote or local IO", async () => {
  const memory = asset();
  const { calls, store } = harness({ getMemory: () => memory });
  assert.equal(await store.loadImageAsset("workspace-1", "asset-1"), memory);
  assert.deepEqual(calls, {
    remoteLoads: 0,
    uploads: 0,
    localReads: 0,
    localPuts: 0,
    localRemoves: 0,
  });
});

test("loadImageAsset caches a remote hit", async () => {
  const remote = asset();
  const { calls, store } = harness({
    loadRemote: async () => { calls.remoteLoads += 1; return remote; },
  });
  assert.equal(await store.loadImageAsset("workspace-1", "asset-1"), remote);
  assert.equal(calls.remoteLoads, 1);
  assert.equal(calls.localPuts, 1);
  assert.equal(calls.localReads, 0);
});

test("loadImageAsset falls back to local legacy asset and migrates it", async () => {
  const legacy = asset();
  const { calls, store } = harness({
    loadRemote: async () => { calls.remoteLoads += 1; throw new Error("offline"); },
    readLocal: async () => { calls.localReads += 1; return legacy; },
  });
  assert.equal(await store.loadImageAsset("workspace-1", "asset-1"), legacy);
  assert.equal(calls.remoteLoads, 1);
  assert.equal(calls.localReads, 1);
  assert.equal(calls.uploads, 1);
});

test("loadImageAsset removes legacy cache when server rejects ownership", async () => {
  const legacy = asset();
  const { calls, store } = harness({
    readLocal: async () => { calls.localReads += 1; return legacy; },
    uploadRemote: async () => { calls.uploads += 1; return false; },
  });
  assert.equal(await store.loadImageAsset("workspace-1", "asset-1"), null);
  assert.equal(calls.localRemoves, 1);
});

test("loadImageAsset keeps legacy readable when migration upload is temporarily unavailable", async () => {
  const legacy = asset();
  const { calls, store } = harness({
    readLocal: async () => { calls.localReads += 1; return legacy; },
    uploadRemote: async () => { calls.uploads += 1; throw new Error("offline"); },
  });
  assert.equal(await store.loadImageAsset("workspace-1", "asset-1"), legacy);
  assert.equal(calls.localRemoves, 0);
});

test("loadImageAsset deduplicates concurrent remote loads", async () => {
  let resolveRemote!: (value: LocalImageAsset | null) => void;
  const pending = new Promise<LocalImageAsset | null>((resolve) => { resolveRemote = resolve; });
  let remoteCalls = 0;
  const { store } = harness({
    loadRemote: async () => {
      remoteCalls += 1;
      return pending;
    },
  });

  const first = store.loadImageAsset("workspace-1", "asset-1");
  const second = store.loadImageAsset("workspace-1", "asset-1");
  resolveRemote(asset());
  await Promise.all([first, second]);

  assert.equal(remoteCalls, 1);
});

test("storeImageAsset normalizes, uploads, and caches accepted asset", async () => {
  const normalized = new Blob(["normalized"], { type: "image/webp" });
  const { calls, store } = harness({
    normalize: async () => normalized,
  });
  const result = await store.storeImageAsset("workspace-1", "asset-1", new Blob(["source"], { type: "image/png" }));

  assert.equal(calls.uploads, 1);
  assert.equal(calls.localPuts, 1);
  assert.equal(result?.mimeType, "image/webp");
  assert.equal(result?.createdAt, 123);
});
