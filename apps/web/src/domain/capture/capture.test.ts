import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CAPTURE_BYTES, validCaptureContent } from "./capture.ts";

test("Capture rejects empty content and enforces UTF-8 byte limits", () => {
  assert.equal(validCaptureContent(""), false);
  assert.equal(validCaptureContent(" \n "), false);
  assert.equal(validCaptureContent("a"), true);
  assert.equal(validCaptureContent("a".repeat(MAX_CAPTURE_BYTES)), true);
  assert.equal(validCaptureContent("a".repeat(MAX_CAPTURE_BYTES + 1)), false);
  assert.equal(validCaptureContent("🍀".repeat(MAX_CAPTURE_BYTES / 4)), true);
  assert.equal(validCaptureContent("🍀".repeat(MAX_CAPTURE_BYTES / 4 + 1)), false);
});
