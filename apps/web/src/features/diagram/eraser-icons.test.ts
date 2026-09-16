import assert from "node:assert/strict";
import test from "node:test";
import {
  ERASER_ICON_BASE_URL,
  ERASER_ICON_PREVIEW_BASE_URL,
  eraserIconFileId,
  eraserIconName,
  eraserIconPreviewUrl,
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

test("palette previews use the CDN while canvas insertion keeps the validated gateway", () => {
  assert.equal(eraserIconUrl("docker"), `${ERASER_ICON_BASE_URL}/docker`);
  assert.equal(eraserIconPreviewUrl("docker"), `${ERASER_ICON_PREVIEW_BASE_URL}/docker.svg`);
  assert.equal(eraserIconUrlForCatalogKey("docker"), `${ERASER_ICON_PREVIEW_BASE_URL}/docker.svg`);
  assert.equal(eraserIconUrlForCatalogKey("aws-s3"), `${ERASER_ICON_PREVIEW_BASE_URL}/aws-simple-storage-service.svg`);
  assert.equal(eraserIconFileId("docker"), "eraser-icon-docker");
  assert.equal(eraserNodeIconElementId("shape-1"), "shape-1-eraser-icon");
});
