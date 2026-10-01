import assert from "node:assert/strict";
import { test } from "node:test";
import { openExternalUrl } from "./external-links.ts";

test("external links keep browser new-tab behavior", async () => {
  const originalWindow = globalThis.window;
  const calls: unknown[][] = [];
  globalThis.window = {
    open: (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
  } as unknown as Window & typeof globalThis;

  try {
    await openExternalUrl("https://example.com/path");
    assert.deepEqual(calls, [["https://example.com/path", "_blank", "noopener,noreferrer"]]);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("external links reject non-external protocols", async () => {
  await assert.rejects(() => openExternalUrl("javascript:alert(1)"), /Unsupported external URL protocol/);
});
