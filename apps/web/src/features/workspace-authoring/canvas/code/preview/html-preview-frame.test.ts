import assert from "node:assert/strict";
import { test } from "node:test";
import { canPreviewHtml } from "./can-preview-html.ts";
import {
  escapeHtmlAttribute,
  HTML_PREVIEW_CSP,
  HTML_PREVIEW_HOST_CSP,
  htmlPreviewHostDocument,
} from "./html-preview-document.ts";

test("canPreviewHtml enables HTML/XML preview strictly for xml language blocks", () => {
  assert.equal(canPreviewHtml("xml"), true);
  assert.equal(canPreviewHtml("javascript"), false);
  assert.equal(canPreviewHtml("plaintext"), false);
  assert.equal(
    canPreviewHtml({
      version: 1,
      code: "<button>Hi</button>",
      language: "xml",
      languageLocked: false,
      theme: "auto",
      lineNumbers: true,
      heightMode: "auto",
    }),
    true,
  );
});

test("two-layer HTML preview CSP contains child navigations and blocks network, workers, and frames", () => {
  assert.match(HTML_PREVIEW_HOST_CSP, /default-src 'none'/);
  assert.match(HTML_PREVIEW_HOST_CSP, /script-src 'unsafe-inline'/);
  assert.match(HTML_PREVIEW_HOST_CSP, /frame-src about:/);
  assert.match(HTML_PREVIEW_HOST_CSP, /child-src about:/);
  assert.match(HTML_PREVIEW_HOST_CSP, /connect-src 'none'/);
  assert.match(HTML_PREVIEW_CSP, /default-src 'none'/);
  assert.match(HTML_PREVIEW_CSP, /connect-src 'none'/);
  assert.match(HTML_PREVIEW_CSP, /frame-src 'none'/);
  assert.match(HTML_PREVIEW_CSP, /child-src 'none'/);
  assert.match(HTML_PREVIEW_CSP, /worker-src 'none'/);
  assert.match(HTML_PREVIEW_CSP, /object-src 'none'/);
  assert.match(HTML_PREVIEW_CSP, /base-uri 'none'/);
  assert.match(HTML_PREVIEW_CSP, /form-action 'none'/);
});

test("htmlPreviewHostDocument escapes attribute breakout attempts inside nested srcdoc", () => {
  const attack = '"></iframe><iframe src="https://evil.example"></iframe>';
  const hostDoc = htmlPreviewHostDocument(attack);
  assert.equal(hostDoc.includes('<iframe src="https://evil.example"'), false);
  assert.equal(hostDoc.includes(escapeHtmlAttribute(attack)), true);
  assert.match(hostDoc, /name="notespace-html-preview"/);
  assert.match(hostDoc, /sandbox="allow-scripts"/);
  assert.match(hostDoc, /referrerpolicy="no-referrer"/);
});
