import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareDocumentImage } from "./document-image-actions.ts";
import type { LocalImageAsset } from "../../../adapters/assets/image-types.ts";

function file(name = "diagram.png") {
  const blob = new Blob(["image"], { type: "image/png" });
  Object.defineProperty(blob, "name", { value: name });
  return blob as File;
}

function storedAsset(id = "asset-1"): LocalImageAsset {
  return {
    id,
    workspaceId: "workspace-1",
    blob: new Blob(["image"], { type: "image/png" }),
    mimeType: "image/png",
    createdAt: 1,
  };
}

test("prepareDocumentImage returns a durable image node only after storage succeeds", async () => {
  const node = await prepareDocumentImage({
    workspaceId: "workspace-1",
    assetId: "asset-1",
    file: file(),
    store: async () => storedAsset(),
  });

  assert.deepEqual(node, {
    type: "image",
    attrs: {
      assetId: "asset-1",
      src: "notespace-asset://asset-1",
      alt: "diagram.png",
    },
  });
});

test("prepareDocumentImage returns null when workspace ownership disappears", async () => {
  const node = await prepareDocumentImage({
    workspaceId: "workspace-1",
    assetId: "asset-1",
    file: file(),
    store: async () => null,
  });

  assert.equal(node, null);
});

test("prepareDocumentImage uses a stable fallback alt and propagates storage failures", async () => {
  const node = await prepareDocumentImage({
    workspaceId: "workspace-1",
    assetId: "asset-1",
    file: file(""),
    store: async () => storedAsset(),
  });
  assert.equal(node?.attrs.alt, "Pasted image");

  await assert.rejects(
    prepareDocumentImage({
      workspaceId: "workspace-1",
      assetId: "asset-1",
      file: file(),
      store: async () => { throw new Error("storage failed"); },
    }),
    /storage failed/,
  );
});
