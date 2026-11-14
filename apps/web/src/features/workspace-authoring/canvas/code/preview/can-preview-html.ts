import { effectiveCanvasCodeLanguage, type CanvasCodeBlockData } from "../canvas-code-block.ts";

export function canPreviewHtml(language: string | CanvasCodeBlockData) {
  const normalized = typeof language === "string" ? language : effectiveCanvasCodeLanguage(language);
  return normalized === "xml";
}
