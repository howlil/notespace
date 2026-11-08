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
      theme: "dark",
    }),
  };

  const markup = canvasCodeBlocksSvgMarkup([block], false);

  assert.match(markup, /rotate\(45 /);
  assert.match(markup, /fill="#2b2b2b"/);
  assert.match(markup, /fill="#cc7832"/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(markup, />JavaScript<\/text>/);
  assert.match(markup, /notespace-code-export-clip-0-body/);
  assert.doesNotMatch(markup, /<img\b/i);
  assert.match(markup, /notespace-code-export-clip-0/);
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
