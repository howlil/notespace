export const HTML_PREVIEW_HOST_FRAME_NAME = "notespace-html-preview-host";
export const HTML_PREVIEW_CONTENT_FRAME_NAME = "notespace-html-preview";

/**
 * Outer host frame runs zero JavaScript of its own in an opaque origin and
 * restricts child frame navigations strictly to `about:` so any top, self,
 * meta-refresh, or link navigation out of the nested `srcdoc` content frame is
 * blocked by Chromium/WebView2 before any network request can leave. Because
 * `srcdoc` children inherit the parent document's CSP list in Chromium/WebView2,
 * `HTML_PREVIEW_HOST_CSP` allows inline execution and `data:` media here while
 * `HTML_PREVIEW_CSP` enforces the full sandbox inside the nested content frame.
 */
export const HTML_PREVIEW_HOST_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  "frame-src about:",
  "child-src about:",
  "connect-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * User-authored HTML is executable content and must stay in an opaque-origin
 * nested `srcdoc` frame (`allow-scripts` only, no `allow-same-origin`). Inline
 * HTML/CSS/JS run locally without network access, workers, forms, or frames.
 */
export const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function htmlPreviewDocument(code: string) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;min-height:100%;box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}</style>
</head><body>${code}</body></html>`;
}

export function htmlPreviewHostDocument(code: string, title = "Canvas interactive HTML preview") {
  const inner = escapeHtmlAttribute(htmlPreviewDocument(code));
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_HOST_CSP}">
<style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;display:block;overflow:hidden}</style>
</head><body><iframe name="${HTML_PREVIEW_CONTENT_FRAME_NAME}" title="${escapeHtmlAttribute(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${inner}"></iframe></body></html>`;
}
