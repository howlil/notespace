import { useCallback, useEffect, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../../../../shared/browser/local-storage";
import {
  CANVAS_BACKGROUND_PATTERN_STORAGE_KEY,
  parseCanvasBackgroundPattern,
  type CanvasBackgroundPattern,
} from "./canvas-background-pattern";

/** The user's chosen Canvas background motif, remembered per browser. Starts as dots so SSR matches. */
export function useCanvasBackgroundPattern(): [
  CanvasBackgroundPattern,
  (pattern: CanvasBackgroundPattern) => void,
] {
  const [pattern, setPattern] = useState<CanvasBackgroundPattern>("dots");
  useEffect(() => {
    setPattern(parseCanvasBackgroundPattern(readLocalStorage(CANVAS_BACKGROUND_PATTERN_STORAGE_KEY)));
  }, []);
  const update = useCallback((next: CanvasBackgroundPattern) => {
    setPattern(next);
    writeLocalStorage(CANVAS_BACKGROUND_PATTERN_STORAGE_KEY, next);
  }, []);
  return [pattern, update];
}
