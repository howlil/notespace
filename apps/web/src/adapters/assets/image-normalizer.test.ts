import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeImageBlob } from "./image-normalizer.ts";

test("normalizeImageBlob rejects non-image content", async () => {
  await assert.rejects(
    normalizeImageBlob(new Blob(["hello"], { type: "text/plain" })),
    /Only image files can be pasted/,
  );
});

test("normalizeImageBlob keeps an under-limit image when browser decoding is unavailable", async () => {
  const source = new Blob(["image"], { type: "image/png" });
  assert.equal(await normalizeImageBlob(source), source);
});

test("normalizeImageBlob rejects an oversized image when it cannot be compressed", async () => {
  const source = new Blob(
    [new Uint8Array((8 * 1024 * 1024) + 1)],
    { type: "image/png" },
  );
  await assert.rejects(
    normalizeImageBlob(source),
    /larger than the 8 MiB asset limit/,
  );
});
