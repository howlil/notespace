/**
 * When the contextual Canvas toolbar appears for a selection. The toolbar is useful but noisy if it
 * shows on every click, so the default waits for the selection to settle and the user can choose a
 * calmer presentation.
 */
export type ContextualToolbarMode = "floating" | "compact" | "docked" | "off";

export const CONTEXTUAL_TOOLBAR_MODE_STORAGE_KEY = "notespace.canvas.contextualToolbarMode";

/** A selection must stay put this long before the floating toolbar appears. */
export const CONTEXTUAL_TOOLBAR_SETTLE_MS = 300;

export const CONTEXTUAL_TOOLBAR_MODES: readonly { mode: ContextualToolbarMode; label: string; description: string }[] = [
  { mode: "floating", label: "Floating", description: "Appears next to the selection once it settles" },
  { mode: "compact", label: "Compact", description: "Shows one small button that opens the toolbar" },
  { mode: "docked", label: "Docked", description: "Stays in a fixed spot at the bottom" },
  { mode: "off", label: "Off", description: "Hides toolbars for selected elements" },
];

export function parseContextualToolbarMode(value: string | null | undefined): ContextualToolbarMode {
  return value === "compact" || value === "docked" || value === "off" ? value : "floating";
}

/** Docked toolbars never jump around, so they need no settling; tool-style toolbars follow the tool button. */
export function contextualToolbarSettleDelay(mode: ContextualToolbarMode, hasSelection: boolean): number {
  return !hasSelection || mode === "docked" ? 0 : CONTEXTUAL_TOOLBAR_SETTLE_MS;
}

export type ContextualToolbarPresentation = "hidden" | "chip" | "full";

export function contextualToolbarPresentation(input: {
  mode: ContextualToolbarMode;
  hasSelection: boolean;
  suppressed: boolean;
  settled: boolean;
  dismissed: boolean;
  expanded: boolean;
}): ContextualToolbarPresentation {
  if (input.suppressed) return "hidden";
  // With no selection the toolbar belongs to the active drawing tool, which the user chose on purpose.
  if (!input.hasSelection) return "full";
  if (input.mode === "off" || input.dismissed || !input.settled) return "hidden";
  if (input.mode === "compact" && !input.expanded) return "chip";
  return "full";
}

/** Escape inside text fields belongs to that editor, not to the toolbar. */
export function isToolbarDismissKey(event: { key: string; defaultPrevented: boolean; target: EventTarget | null }): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  return !target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable=''], .cm-editor");
}
