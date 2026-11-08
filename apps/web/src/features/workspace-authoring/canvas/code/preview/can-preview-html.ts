export function canPreviewHtml(language: string) {
  const normalized = language.trim().toLowerCase();
  // Existing code blocks store HTML syntax highlighting as "xml".
  return normalized === "xml" || normalized === "html";
}
