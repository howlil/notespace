import { useCallback, useEffect, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../../../../shared/browser/local-storage";
import {
  CONTEXTUAL_TOOLBAR_MODE_STORAGE_KEY,
  contextualToolbarPresentation,
  contextualToolbarSettleDelay,
  isToolbarDismissKey,
  parseContextualToolbarMode,
  type ContextualToolbarMode,
  type ContextualToolbarPresentation,
} from "./contextual-toolbar-policy";

/** Some libraries keep unrendered dialogs mounted, so only popups that take up space count. */
function hasRenderedPopup(): boolean {
  return [...document.querySelectorAll("[role='dialog'], [role='menu'], [role='listbox']")].some((node) => node.getClientRects().length > 0);
}

/** The user's chosen toolbar presentation, remembered per browser. Starts as the default so SSR matches. */
export function useContextualToolbarMode(): [ContextualToolbarMode, (mode: ContextualToolbarMode) => void] {
  const [mode, setMode] = useState<ContextualToolbarMode>("floating");
  useEffect(() => {
    setMode(parseContextualToolbarMode(readLocalStorage(CONTEXTUAL_TOOLBAR_MODE_STORAGE_KEY)));
  }, []);
  const update = useCallback((next: ContextualToolbarMode) => {
    setMode(next);
    writeLocalStorage(CONTEXTUAL_TOOLBAR_MODE_STORAGE_KEY, next);
  }, []);
  return [mode, update];
}

/**
 * Decides whether the contextual toolbar shows for the current selection: it waits for the selection
 * to settle, stays hidden while the user manipulates, hides on Escape until the selection changes,
 * and in compact mode needs one click on the chip to open.
 */
export function useContextualToolbarPresentation({ mode, selectionKey, hasSelection, suppressed, interactionActive }: {
  mode: ContextualToolbarMode;
  selectionKey: string;
  hasSelection: boolean;
  suppressed: boolean;
  /** A toolbar popup is open, so Escape belongs to it. */
  interactionActive: boolean;
}): { presentation: ContextualToolbarPresentation; expand: () => void } {
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const delay = contextualToolbarSettleDelay(mode, hasSelection);

  useEffect(() => {
    if (suppressed) {
      setSettledKey(null);
      return undefined;
    }
    if (delay === 0) {
      setSettledKey(selectionKey);
      return undefined;
    }
    const timer = window.setTimeout(() => setSettledKey(selectionKey), delay);
    return () => window.clearTimeout(timer);
  }, [delay, selectionKey, suppressed]);

  useEffect(() => {
    if (!hasSelection || interactionActive) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isToolbarDismissKey(event)) return;
      // An open popup or dialog owns Escape; the toolbar only hides on the next one.
      if (hasRenderedPopup()) return;
      setDismissedKey(selectionKey);
      setExpandedKey(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasSelection, interactionActive, selectionKey]);

  const expand = useCallback(() => setExpandedKey(selectionKey), [selectionKey]);
  const presentation = contextualToolbarPresentation({
    mode,
    hasSelection,
    suppressed,
    settled: delay === 0 || settledKey === selectionKey,
    dismissed: dismissedKey === selectionKey,
    expanded: expandedKey === selectionKey,
  });
  return { presentation, expand };
}
