import { useEffect, useState } from "react";
import { HTML_PREVIEW_HOST_FRAME_NAME, htmlPreviewHostDocument } from "./html-preview-document";

export { canPreviewHtml } from "./can-preview-html";
export {
  escapeHtmlAttribute,
  HTML_PREVIEW_CONTENT_FRAME_NAME,
  HTML_PREVIEW_CSP,
  HTML_PREVIEW_HOST_CSP,
  HTML_PREVIEW_HOST_FRAME_NAME,
  htmlPreviewDocument,
  htmlPreviewHostDocument,
} from "./html-preview-document";

export function HtmlPreviewFrame({
  code,
  title = "Canvas interactive HTML preview",
  className = "",
}: {
  code: string;
  title?: string;
  className?: string;
}) {
  const [snapshot, setSnapshot] = useState(code);

  // Debounce updates while editing so typing does not restart scripts per keystroke.
  useEffect(() => {
    if (code === snapshot) return;
    const timer = window.setTimeout(() => setSnapshot(code), 450);
    return () => window.clearTimeout(timer);
  }, [code, snapshot]);

  return (
    <iframe
      name={HTML_PREVIEW_HOST_FRAME_NAME}
      title={`${title} host`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={htmlPreviewHostDocument(snapshot, title)}
      className={`block h-full w-full border-0 bg-white ${className}`}
    />
  );
}
