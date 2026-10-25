import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CAPTURE_BYTES, isMatchingCaptureConversion, isMatchingCaptureUpdate, validCaptureContent, type CaptureItem } from "./capture.ts";

test("Capture rejects empty content and enforces UTF-8 byte limits", () => {
  assert.equal(validCaptureContent(""), false);
  assert.equal(validCaptureContent(" \n "), false);
  assert.equal(validCaptureContent("a"), true);
  assert.equal(validCaptureContent("a".repeat(MAX_CAPTURE_BYTES)), true);
  assert.equal(validCaptureContent("a".repeat(MAX_CAPTURE_BYTES + 1)), false);
  assert.equal(validCaptureContent("🍀".repeat(MAX_CAPTURE_BYTES / 4)), true);
  assert.equal(validCaptureContent("🍀".repeat(MAX_CAPTURE_BYTES / 4 + 1)), false);
});

test("lost-response conversion only reconciles exact Capture version and destination", () => {
  const receipt: CaptureItem = {
    id: "capture-1", content: "Captured body", status: "converted", version: 3,
    createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:01:00Z",
    targetKind: "note", targetWorkspaceId: "workspace-1", targetId: "note-1",
    convertedAt: "2026-10-26T00:01:00Z",
  };
  assert.equal(isMatchingCaptureConversion(receipt, { version: 2, workspaceId: "workspace-1", kind: "note" }), true);
  // Another tab edited v1->v2 then organized v2->v3. This is not a v1 replay.
  assert.equal(isMatchingCaptureConversion(receipt, { version: 1, workspaceId: "workspace-1", kind: "note" }), false);
  assert.equal(isMatchingCaptureConversion(receipt, { version: 2, workspaceId: "workspace-2", kind: "note" }), false);
  assert.equal(isMatchingCaptureConversion(receipt, { version: 2, workspaceId: "workspace-1", kind: "task" }), false);
  assert.equal(isMatchingCaptureConversion({ ...receipt, targetId: "" }, { version: 2, workspaceId: "workspace-1", kind: "note" }), false);
  assert.equal(isMatchingCaptureConversion({ ...receipt, status: "pending" }, { version: 2, workspaceId: "workspace-1", kind: "note" }), false);
});

test("lost edit response reconciles only the exact next pending version and content", () => {
  const receipt: CaptureItem = {
    id: "capture-1", content: "Edited content", status: "pending", version: 2,
    createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:01:00Z",
  };
  assert.equal(isMatchingCaptureUpdate(receipt, { version: 1, content: "Edited content" }), true);
  assert.equal(isMatchingCaptureUpdate(receipt, { version: 2, content: "Edited content" }), false);
  assert.equal(isMatchingCaptureUpdate({ ...receipt, version: 3 }, { version: 1, content: "Edited content" }), false);
  assert.equal(isMatchingCaptureUpdate(receipt, { version: 1, content: "Different content" }), false);
  assert.equal(isMatchingCaptureUpdate({ ...receipt, status: "converted" }, { version: 1, content: "Edited content" }), false);
});
