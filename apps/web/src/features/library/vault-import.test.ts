import assert from "node:assert/strict";
import test from "node:test";
import { importedDocumentTitle, markdownWithVaultImages, normalizeVaultPath, resolveVaultReference } from "./vault-import.ts";

test("vault paths resolve relative Markdown assets without escaping the selected root", () => {
  assert.equal(normalizeVaultPath("Backend\\Go/../Redis.md"), "Backend/Redis.md");
  assert.equal(resolveVaultReference("Backend/Redis.md", "../assets/redis.png"), "assets/redis.png");
  assert.equal(resolveVaultReference("Backend/Redis.md", "https://example.com/image.png"), null);
});

test("standalone vault images become native Notespace image nodes", () => {
  const snapshot = markdownWithVaultImages("# Redis\n\n![diagram](../assets/redis.png)\n\nConsistency", (source) => source.includes("redis.png") ? { assetId: "asset-1", src: "notespace-asset://asset-1" } : null);
  const content = snapshot.data.content as Array<{ type: string; attrs?: Record<string, unknown> }>;
  assert.equal(content[0].type, "heading");
  assert.deepEqual(content[1], { type: "image", attrs: { assetId: "asset-1", src: "notespace-asset://asset-1", alt: "diagram" } });
  assert.equal(content[2].type, "paragraph");
});

test("import title prefers a heading and falls back to filename", () => {
  assert.equal(importedDocumentTitle("Backend/redis.md", "# Redis internals\nbody"), "Redis internals");
  assert.equal(importedDocumentTitle("Backend/redis.md", "body only"), "redis");
});
