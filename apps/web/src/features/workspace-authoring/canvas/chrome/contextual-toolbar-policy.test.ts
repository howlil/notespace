import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXTUAL_TOOLBAR_MODES,
  CONTEXTUAL_TOOLBAR_SETTLE_MS,
  contextualToolbarPresentation,
  contextualToolbarSettleDelay,
  isToolbarDismissKey,
  parseContextualToolbarMode,
} from "./contextual-toolbar-policy.ts";

const base = { mode: "floating", hasSelection: true, suppressed: false, settled: true, dismissed: false, expanded: false } as const;

test("stored mode falls back to floating for unknown values", () => {
  assert.equal(parseContextualToolbarMode(null), "floating");
  assert.equal(parseContextualToolbarMode("nonsense"), "floating");
  for (const { mode } of CONTEXTUAL_TOOLBAR_MODES) assert.equal(parseContextualToolbarMode(mode), mode);
});

test("only floating and compact selections wait for the selection to settle", () => {
  assert.equal(contextualToolbarSettleDelay("floating", true), CONTEXTUAL_TOOLBAR_SETTLE_MS);
  assert.equal(contextualToolbarSettleDelay("compact", true), CONTEXTUAL_TOOLBAR_SETTLE_MS);
  assert.equal(contextualToolbarSettleDelay("docked", true), 0);
  assert.equal(contextualToolbarSettleDelay("floating", false), 0);
});

test("toolbar stays hidden until settled and while manipulating or dismissed", () => {
  assert.equal(contextualToolbarPresentation(base), "full");
  assert.equal(contextualToolbarPresentation({ ...base, settled: false }), "hidden");
  assert.equal(contextualToolbarPresentation({ ...base, suppressed: true }), "hidden");
  assert.equal(contextualToolbarPresentation({ ...base, dismissed: true }), "hidden");
});

test("compact shows a chip until expanded, off hides selection toolbars", () => {
  assert.equal(contextualToolbarPresentation({ ...base, mode: "compact" }), "chip");
  assert.equal(contextualToolbarPresentation({ ...base, mode: "compact", expanded: true }), "full");
  assert.equal(contextualToolbarPresentation({ ...base, mode: "compact", dismissed: true }), "hidden");
  assert.equal(contextualToolbarPresentation({ ...base, mode: "off" }), "hidden");
});

test("a drawing tool's toolbar is never delayed, dismissed, or hidden by the selection mode", () => {
  for (const mode of ["floating", "compact", "docked", "off"] as const) {
    assert.equal(contextualToolbarPresentation({ ...base, mode, hasSelection: false, settled: false, dismissed: true }), "full");
  }
  assert.equal(contextualToolbarPresentation({ ...base, hasSelection: false, suppressed: true }), "hidden");
});

test("Escape dismisses the toolbar unless a text field or prevented handler owns it", () => {
  const plain = { closest: () => null } as unknown as EventTarget;
  const field = { closest: () => ({}) } as unknown as EventTarget;
  assert.equal(isToolbarDismissKey({ key: "Escape", defaultPrevented: false, target: plain }), true);
  assert.equal(isToolbarDismissKey({ key: "Escape", defaultPrevented: false, target: null }), true);
  assert.equal(isToolbarDismissKey({ key: "Escape", defaultPrevented: true, target: plain }), false);
  assert.equal(isToolbarDismissKey({ key: "Escape", defaultPrevented: false, target: field }), false);
  assert.equal(isToolbarDismissKey({ key: "a", defaultPrevented: false, target: plain }), false);
});
