import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasEmbedUrl,
  extractCanvasEmbedUrl,
  validateCanvasEmbeddable,
} from "./canvas-embed.ts";

test("Canvas embeds allow arbitrary HTTP and HTTPS hosts rather than a domain whitelist", () => {
  assert.equal(validateCanvasEmbeddable("https://howlil.tech"), true);
  assert.equal(validateCanvasEmbeddable("https://example.invalid/path?q=1#section"), true);
  assert.equal(validateCanvasEmbeddable("http://localhost:3000/dashboard"), true);
});

test("Canvas embeds reject non-web protocols and malformed values", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "blob:https://example.com/id",
    "about:blank",
    "not a url",
    "",
  ]) {
    assert.equal(validateCanvasEmbeddable(value), false, value);
  }
});

test("embed snippets are parsed to their src or href before URL validation", () => {
  assert.equal(
    extractCanvasEmbedUrl('<iframe src="https://player.example.com/embed/123" allowfullscreen></iframe>'),
    "https://player.example.com/embed/123",
  );
  assert.equal(
    extractCanvasEmbedUrl("<blockquote href='https://example.com/post/1'></blockquote>"),
    "https://example.com/post/1",
  );
  assert.equal(canvasEmbedUrl('<iframe src="javascript:alert(1)"></iframe>'), null);
});
