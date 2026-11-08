import assert from "node:assert/strict";
import test from "node:test";
import { canPreviewHtml } from "./can-preview-html.ts";

test("HTML preview capability accepts HTML and legacy XML syntax labels", () => {
  assert.equal(canPreviewHtml("html"), true);
  assert.equal(canPreviewHtml(" XML "), true);
  assert.equal(canPreviewHtml("javascript"), false);
});
