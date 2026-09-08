import assert from "node:assert/strict";
import test from "node:test";
import {
  ERASER_ICON_BASE_URL,
  eraserIconFileId,
  eraserIconName,
  eraserIconUrl,
  eraserIconUrlForCatalogKey,
  eraserNodeIconElementId,
} from "./eraser-icons.ts";

test("catalog keys resolve to the canonical Eraser icon names", () => {
  assert.equal(eraserIconName("docker"), "docker");
  assert.equal(eraserIconName("nodejs"), "node");
  assert.equal(eraserIconName("postgresql"), "postgres");
  assert.equal(eraserIconName("aws-s3"), "aws-simple-storage-service");
  assert.equal(eraserIconName("gcp-run"), "gcp-cloud-run");
  assert.equal(eraserIconName("azure-functions"), "azure-function-apps");
});

test("Eraser asset URLs and generated Excalidraw ids are deterministic", () => {
  assert.equal(eraserIconUrl("docker"), `${ERASER_ICON_BASE_URL}/docker`);
  assert.equal(eraserIconUrlForCatalogKey("docker"), `${ERASER_ICON_BASE_URL}/docker`);
  assert.equal(eraserIconFileId("docker"), "eraser-icon-docker");
  assert.equal(eraserNodeIconElementId("shape-1"), "shape-1-eraser-icon");
});
