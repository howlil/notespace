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

test("normalizeImageBlob rasterizes under-limit SVG blobs to WebP so DEC8 asset uploads succeed", async (t) => {
  const prevDoc = Object.getOwnPropertyDescriptor(globalThis, "document");
  const prevBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  let closed = false;
  let drawn = false;
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => ({
      width: 64,
      height: 64,
      close: () => { closed = true; },
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, "canvas");
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => { drawn = true; },
          }),
          toBlob: (callback: (blob: Blob | null) => void, type?: string) => {
            callback(new Blob(["rasterized-webp"], { type: type ?? "image/webp" }));
          },
        };
      },
    },
  });
  t.after(() => {
    if (prevDoc) Object.defineProperty(globalThis, "document", prevDoc);
    else Reflect.deleteProperty(globalThis, "document");
    if (prevBitmap) Object.defineProperty(globalThis, "createImageBitmap", prevBitmap);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  });

  const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>'], {
    type: "image/svg+xml",
  });
  const normalized = await normalizeImageBlob(svg);
  assert.equal(drawn, true);
  assert.equal(closed, true);
  assert.equal(normalized.type, "image/webp");
});

test("normalizeImageBlob refuses unrasterized SVG when browser decoding is unavailable", async () => {
  const svg = new Blob(["<svg/>"], { type: "image/svg+xml" });
  await assert.rejects(
    normalizeImageBlob(svg),
    /SVG images cannot be stored without rasterization/,
  );
});
