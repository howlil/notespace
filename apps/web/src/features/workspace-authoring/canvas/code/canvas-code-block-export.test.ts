import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canvasCodeBlocksSvgMarkup } from "./canvas-code-block-export.ts";
import { withCanvasCodeBlock, defaultCanvasCodeBlock } from "./canvas-code-block.ts";

test("SVG export renders rotated code blocks with escaped, themed source", () => {
  const block = {
    id: "code-1",
    x: 10,
    y: 20,
    width: 360,
    height: 80,
    angle: Math.PI / 4,
    customData: withCanvasCodeBlock(undefined, {
      ...defaultCanvasCodeBlock(),
      code: `const value = "<img src=x onerror=alert(1)>";`,
      language: "javascript",
      languageLocked: true,
      theme: "dark",
    }),
  };

  const markup = canvasCodeBlocksSvgMarkup([block], false);

  assert.match(markup, /rotate\(45 /);
  assert.match(markup, /fill="#2b2b2b"/);
  assert.match(markup, /fill="#cc7832"/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, />JavaScript<\/text>/);
  assert.match(markup, /y="42"/); // source baseline: y + border + padding + font + 2; no header
  assert.doesNotMatch(markup, /<iframe|stdout|Code output/);
  assert.match(markup, /notespace-code-export-clip-0-body/);
  assert.doesNotMatch(markup, /<img\b/i);
  assert.match(markup, /notespace-code-export-clip-0/);
});

test("source export uses the same effective Auto language as the card", () => {
  const block = { ...defaultCanvasCodeBlock(), code: '<section class="content">Hello</section>', language: "plaintext", languageLocked: false };
  const element = { id: "auto", x: 0, y: 0, width: 360, height: 80, angle: 0 };
  const auto = canvasCodeBlocksSvgMarkup([{ ...element, customData: withCanvasCodeBlock(undefined, block) }], false);
  const locked = canvasCodeBlocksSvgMarkup([{ ...element, customData: withCanvasCodeBlock(undefined, { ...block, language: "xml", languageLocked: true }) }], false);
  assert.equal(auto, locked);
});

test("source export follows per-element transient word wrap without changing authored data", () => {
  const element = {
    id: "nowrap", x: 0, y: 0, width: 120, height: 200, angle: 0,
    customData: withCanvasCodeBlock(undefined, { ...defaultCanvasCodeBlock(), code: 'const text = "' + "abcdefghij".repeat(20) + '";', lineNumbers: false }),
  };
  const authored = JSON.stringify(element);
  const wrapped = canvasCodeBlocksSvgMarkup([element], false);
  const nowrap = canvasCodeBlocksSvgMarkup([element], false, { nowrap: { wordWrap: false } });
  assert.ok((wrapped.match(/<text /g) ?? []).length > 1);
  assert.equal((nowrap.match(/<text /g) ?? []).length, 1);
  assert.match(nowrap, /abcdefghijabcdefghij/);
  assert.match(nowrap, /clip-path=/);
  assert.equal(canvasCodeBlocksSvgMarkup([element], false, { other: { wordWrap: false } }), wrapped);
  assert.equal(canvasCodeBlocksSvgMarkup([element], false, { nowrap: { wordWrap: true } }), wrapped);
  assert.equal(JSON.stringify(element), authored);
});

test("SVG export skips deleted and non-code scene elements", () => {
  const plain = { id: "shape", x: 0, y: 0, width: 100, height: 50, angle: 0 };
  const deleted = {
    ...plain,
    id: "deleted-code",
    isDeleted: true,
    customData: withCanvasCodeBlock(undefined, defaultCanvasCodeBlock()),
  };
  const malformed = {
    ...plain,
    id: "malformed-code",
    x: '0" onload="alert(1)' as unknown as number,
    customData: withCanvasCodeBlock(undefined, defaultCanvasCodeBlock()),
  };
  assert.equal(canvasCodeBlocksSvgMarkup([plain, deleted, malformed], false), "");
});
