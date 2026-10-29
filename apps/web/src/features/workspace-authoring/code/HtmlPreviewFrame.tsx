import { useEffect, useState } from "react";

/**
 * User-authored HTML is executable content. Never render it in the Notespace DOM:
 * the iframe must keep an opaque origin (no allow-same-origin), with CSP applied
 * before the user's markup. Inline HTML/CSS/JS are supported; external assets,
 * network APIs, forms, popups, nested frames, and navigation privileges are not.
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
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
].join("; ");

export function canPreviewHtml(language: string) {
  const normalized = language.trim().toLowerCase();
  // Existing code blocks store HTML syntax highlighting as 'xml'.
  return normalized === "xml" || normalized === "html";
}

export function htmlPreviewDocument(code: string) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;min-height:100%;box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}</style>
</head><body>${code}</body></html>`;
}

export function HtmlPreviewFrame({
  code,
  title = "Interactive HTML preview",
  className = "",
}: {
  code: string;
  title?: string;
  className?: string;
}) {
  const [snapshot, setSnapshot] = useState(code);

  // Do not tear down a running interactive preview on every individual keystroke.
  // A debounce also limits how often user scripts are executed while editing.
  useEffect(() => {
    if (code === snapshot) return;
    const timer = window.setTimeout(() => setSnapshot(code), 450);
    return () => window.clearTimeout(timer);
  }, [code, snapshot]);

  return (
    <iframe
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={htmlPreviewDocument(snapshot)}
      className={`block h-full w-full border-0 bg-white ${className}`}
    />
  );
}
