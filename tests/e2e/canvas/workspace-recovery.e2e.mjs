/* Canvas conflict recovery preserves the draft and supports explicit discard. */
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  api, assert, box, clearFault, click, cleanupWorkspace, createWorkspace,
  drag, injectFault, notVisible, openWorkspace, reload, role,
  start, stop, visible, waitSaved, execute, goto,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: IndexedDB cache bounds confirmed copies and preserves legacy recovery", async () => {
  const { transpileModule, ModuleKind, ScriptTarget } = createRequire(new URL("../../../apps/web/package.json", import.meta.url))("typescript");
  const source = readFileSync(new URL("../../../apps/web/src/adapters/assets/image-cache.ts", import.meta.url), "utf8");
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } });
  await goto("/");
  const result = await execute(async (compiled) => {
    const cache = new Function("exports", `${compiled}; return exports;`)({});
    const asset = (workspaceId, id, bytes) => ({ workspaceId, id, blob: new Blob([new Uint8Array(bytes)]), mimeType: "image/png", createdAt: 1 });
    const records = () => new Promise((resolve, reject) => {
      const request = indexedDB.open("notespace-local-assets", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const read = database.transaction("images", "readonly").objectStore("images").getAll();
        read.onsuccess = () => { database.close(); resolve(read.result); };
        read.onerror = () => { database.close(); reject(read.error); };
      };
    });
    try {
      await cache.clearLocalImageCache();
      await cache.putLocalImageCache(asset("a", "legacy", 4));
      await cache.putLocalImageCache(asset("b", "other", 4));
      for (let index = 0; index < 17; index++) await cache.putLocalImageCache(asset("a", String(index), 8 * 1024 * 1024), true);
      const retained = await records();
      const keys = retained.map((record) => record.key);
      await cache.clearLocalImageCache("a");
      const remaining = (await records()).map((record) => record.key);
      const pendingRead = cache.readLocalImageCache("b", "other");
      await cache.clearLocalImageCache("b");
      return { keys, bytes: retained.reduce((sum, record) => sum + record.blob.size, 0), remaining,
        staleRead: await pendingRead, staleMemory: cache.getMemoryImageAsset("b", "other") };
    } finally {
      await cache.clearLocalImageCache();
    }
  }, outputText);
  assert.ok(result.keys.includes("a:legacy"));
  assert.ok(result.keys.includes("a:16"));
  assert.equal(result.keys.includes("a:0"), false);
  assert.ok(result.bytes <= 128 * 1024 * 1024);
  assert.deepEqual(result.remaining, ["b:other"]);
  assert.equal(result.staleRead, null);
  assert.equal(result.staleMemory, null);
});

test("critical: Canvas conflict recovery retries the local draft and confirms discard", async () => {
  const workspace = await createWorkspace(`Canvas recovery ${Date.now()}`);
  let fault;
  try {
    await openWorkspace(workspace.id);
    const canvas = ".excalidraw__canvas.interactive";
    const bounds = await box(canvas);
    fault = await injectFault({
      method: "PATCH",
      path: `/api/workspaces/${workspace.id}/canvas`,
      respond: async () => ({ status: 409, body: JSON.stringify({ error: "Concurrent edit" }) }),
    });
    await click(role("button", "Rectangle", { exact: true, scope: role("toolbar", "Canvas tools") }));
    await drag({ x: bounds.x + 250, y: bounds.y + 200 }, { x: bounds.x + 400, y: bounds.y + 300 });
    const recovery = role("dialog", "Recover Canvas changes");
    await visible(recovery);
    await visible(role("button", "Download draft", { scope: recovery }));
    await click(role("button", "Retry merged save", { scope: recovery }));
    await visible(role("alert", null, { scope: recovery }));
    await clearFault(fault);
    fault = null;
    await click(role("button", "Retry merged save", { scope: recovery }));
    await notVisible(recovery);
    await waitSaved();
    const saved = await api(`/api/workspaces/${workspace.id}`);
    assert.equal(saved.canvas.data.elements.filter((element) => !element.isDeleted && element.type === "rectangle").length, 1);
    fault = await injectFault({
      method: "PATCH",
      path: `/api/workspaces/${workspace.id}/canvas`,
      respond: async () => ({ status: 409, body: JSON.stringify({ error: "Concurrent edit" }) }),
    });
    await click(role("button", "Rectangle", { exact: true, scope: role("toolbar", "Canvas tools") }));
    await drag({ x: bounds.x + 500, y: bounds.y + 350 }, { x: bounds.x + 650, y: bounds.y + 450 });
    await visible(recovery);
    await click(role("button", "Use saved Canvas", { scope: recovery }));
    await visible(role("button", "Discard local and use saved", { scope: recovery }));
    await clearFault(fault);
    fault = null;
    await click(role("button", "Discard local and use saved", { scope: recovery }));
    await notVisible(recovery);
    await waitSaved();
    await reload();
    await visible(canvas);
    const restored = await api(`/api/workspaces/${workspace.id}`);
    assert.equal(restored.canvas.data.elements.filter((element) => !element.isDeleted && element.type === "rectangle").length, 1);
  } finally {
    if (fault) await clearFault(fault);
    await cleanupWorkspace(workspace.id);
  }
});
