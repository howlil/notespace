const GENERIC_EMBED_RE = /^<(?:iframe|blockquote)\b[\s\S]*?\s(?:src|href)\s*=\s*["']([^"']+)["'][\s\S]*?>$/i;

export function extractCanvasEmbedUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const embedded = trimmed.match(GENERIC_EMBED_RE)?.[1]?.trim();
  return embedded || trimmed;
}

export function canvasEmbedUrl(input: string): URL | null {
  const candidate = extractCanvasEmbedUrl(input);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function validateCanvasEmbeddable(input: string) {
  return canvasEmbedUrl(input) !== null;
}
