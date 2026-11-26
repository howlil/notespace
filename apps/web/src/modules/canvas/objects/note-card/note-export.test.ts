import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  NOTE_CARD_COLORS,
  withCanvasNoteReference,
  type CanvasNoteReference,
  type NoteDocument,
} from "../../../../entities/note.ts";
import {
  canvasNotesSvgMarkup,
  noteCardSurfaceColors,
  type NoteSceneElement,
} from "./note-export.ts";

const md = (...lines: string[]): NoteDocument => ({ type: "markdown", text: lines.join("\n") });

function noteElement(
  overrides: Partial<NoteSceneElement> = {},
  reference: Partial<CanvasNoteReference> = {},
): NoteSceneElement {
  return {
    id: "note-el-1",
    x: 20,
    y: 40,
    width: 320,
    height: 220,
    angle: 0,
    customData: withCanvasNoteReference(undefined, {
      noteId: "note-1",
      instanceId: "inst-1",
      ...reference,
    }),
    ...overrides,
  };
}

test("folded compact Note card renders a rounded frame with a bold truncated first line", () => {
  const doc = md(
    "# Distributed Consensus Protocol Architecture Overview For Production Clusters",
    "",
    "Body paragraph that must not appear while compact.",
  );
  const element = noteElement({ width: 220, height: 48 }, { compact: true });
  const markup = canvasNotesSvgMarkup([element], false, { "note-1": doc });

  assert.match(markup, /rx="8"/);
  assert.match(markup, /font-weight="600"/);
  assert.match(markup, /Distributed Consensus/);
  assert.match(markup, /…<\/tspan>/);
  assert.doesNotMatch(markup, /Body paragraph/);
  assert.doesNotMatch(markup, /<foreignObject\b|<image\b|<img\b/i);
  assert.match(markup, /notespace-note-export-clip-0/);
});

test("unfolded Note card renders headings, lists, checklists, callouts, toggles, code, math, tables, images, and color", () => {
  const doc = md(
    "# Architecture Plan",
    "",
    "Latency scales with $O(n \\log n)$ in steady state.",
    "",
    "- Bullet point",
    "",
    "1. First step",
    "",
    "- [ ] Pending task",
    "- [x] Completed task",
    "",
    "> Quoted principle",
    "",
    "> [!warning]",
    "> Watch lock contention",
    "",
    "<details open>",
    "<summary>Expanded section</summary>",
    "",
    "Visible toggle detail",
    "",
    "</details>",
    "",
    "<details>",
    "<summary>Collapsed section</summary>",
    "",
    "Hidden toggle detail",
    "",
    "</details>",
    "",
    "```",
    "const quorum = Math.floor(n / 2) + 1;",
    "```",
    "",
    "| Node | Role |",
    "| --- | --- |",
    "| n1 | Leader |",
    "",
    "![Cluster topology](/api/workspaces/w1/assets/a1)",
    "",
    "![Remote](https://example.invalid/diagram.png)",
  );

  const element = noteElement({ width: 360, height: 900, angle: Math.PI / 4 }, { color: "blue" });
  const markup = canvasNotesSvgMarkup([element], false, { "note-1": doc });
  const blueSurface = noteCardSurfaceColors("blue", false);

  assert.match(markup, /rotate\(45 /);
  assert.match(markup, new RegExp(`fill="${blueSurface.background}" stroke="${blueSurface.border}"`));
  assert.match(markup, /font-size="18" font-weight="600"><tspan>Architecture Plan<\/tspan>/);
  assert.match(markup, /O\(n \\log n\)/);
  assert.match(markup, />• <\/tspan><tspan[^>]*>Bullet point<\/tspan>/);
  assert.match(markup, />1\. <\/tspan><tspan[^>]*>First step<\/tspan>/);
  assert.match(markup, />☐ <\/tspan><tspan[^>]*>Pending task<\/tspan>/);
  assert.match(markup, />☑ <\/tspan><tspan[^>]*text-decoration="line-through">Completed task<\/tspan>/);
  assert.match(markup, /Quoted principle/);
  assert.match(markup, /Watch lock contention/);
  assert.match(markup, />▾ <\/tspan><tspan[^>]*>Expanded section<\/tspan>/);
  assert.match(markup, /Visible toggle detail/);
  assert.match(markup, />▸ <\/tspan><tspan[^>]*>Collapsed section<\/tspan>/);
  assert.doesNotMatch(markup, /Hidden toggle detail/);
  assert.match(markup, /font-family="JetBrains Mono/);
  assert.match(markup, /const quorum = Math\.floor\(n \/ 2\) \+ 1;/);
  assert.match(markup, /Node \| Role/);
  assert.match(markup, /n1 \| Leader/);
  assert.match(markup, /\[Image: Cluster topology\]/);
  assert.doesNotMatch(markup, /https:\/\/example\.invalid|\/api\/workspaces/);
  assert.doesNotMatch(markup, /<foreignObject\b|<image\b|<img\b/i);
});

test("embedded Notes and block references export their live titles and previews", () => {
  const doc = md(
    "![stale label](/workspaces/w1?noteId=other)",
    "",
    "[Block reference](/workspaces/w1?noteId=other&blockId=b1)",
    "",
    "[Block reference](/workspaces/w1?noteId=gone&blockId=b9)",
  );
  const other = md("# Other Note", "", "The quoted block ^b1");
  const markup = canvasNotesSvgMarkup([noteElement({ height: 400 })], false, { "note-1": doc, other });
  assert.match(markup, /\[Note: Other Note\]/);
  assert.match(markup, /The quoted block/);
  assert.match(markup, /\[Block reference\]/);
});

test("dark mode renders distinct dark surfaces and borders for every card color", () => {
  const doc = md("Dark card content");

  for (const color of NOTE_CARD_COLORS) {
    const lightSurface = noteCardSurfaceColors(color, false);
    const darkSurface = noteCardSurfaceColors(color, true);
    const markup = canvasNotesSvgMarkup([noteElement({}, { color })], true, { "note-1": doc });
    assert.match(markup, new RegExp(`fill="${darkSurface.background}" stroke="${darkSurface.border}"`));
    assert.notEqual(lightSurface.background, darkSurface.background, `${color} card background should adapt to dark mode`);
    assert.notEqual(lightSurface.border, darkSurface.border, `${color} card border should adapt to dark mode`);
    assert.match(markup, /fill="#EBE6DD"/, `${color} dark card should use readable light ink`);
  }
});

test("square cards export with sharp corners and rounded cards keep the default radius", () => {
  const doc = md("Shape");
  const rounded = canvasNotesSvgMarkup([noteElement({}, {})], false, { "note-1": doc });
  const square = canvasNotesSvgMarkup([noteElement({}, { shape: "square" })], false, { "note-1": doc });
  assert.match(rounded, /rx="8" fill="#FFFDF9"/);
  assert.match(square, /rx="0" fill="#FFFDF9"/);
  assert.doesNotMatch(square, /<clipPath[^>]*><rect[^>]*rx="[1-9]/);
});

test("SVG export escapes XML special characters and skips deleted, plain, and malformed elements", () => {
  const doc = md(
    `<script>alert("xss" & '1')</script>`,
    "",
    `![<img src=x onerror="alert(1)">](/api/workspaces/w1/assets/a1)`,
  );

  const valid = noteElement({}, {});
  const plain: NoteSceneElement = { id: "rect", x: 0, y: 0, width: 100, height: 80, angle: 0 };
  const deleted = noteElement({ id: "deleted", isDeleted: true });
  const malformed = noteElement({
    id: "bad",
    x: '0" onload="alert(1)' as unknown as number,
  });

  const markup = canvasNotesSvgMarkup([plain, deleted, malformed, valid], false, { "note-1": doc });
  assert.match(markup, /&lt;script&gt;alert\(&quot;xss&quot; &amp; &apos;1&apos;\)&lt;\/script&gt;/);
  assert.match(markup, /\[Image: &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;\]/);
  assert.doesNotMatch(markup, /<script\b|<img\b|onload=/i);
  assert.equal((markup.match(/<clipPath id="notespace-note-export-clip-\d+"/g) ?? []).length, 1);
});

test("missing or empty Note documents render clean card frames with muted fallback labels", () => {
  const missingMarkup = canvasNotesSvgMarkup([noteElement()], false, {});
  assert.match(missingMarkup, /rx="8"/);
  assert.match(missingMarkup, /<tspan>Note<\/tspan>/);

  const emptyMarkup = canvasNotesSvgMarkup([noteElement()], false, { "note-1": md("") });
  assert.match(emptyMarkup, /rx="8"/);
  assert.match(emptyMarkup, /<tspan>Empty note<\/tspan>/);

  const compactMissingMarkup = canvasNotesSvgMarkup([noteElement({ height: 48 }, { compact: true })], false);
  assert.match(compactMissingMarkup, /<tspan>Note<\/tspan>/);
});

test("word wrapping splits long paragraphs to card inner width and applies export offset", () => {
  const doc = md("Word wrapping keeps narrow Note cards readable without overflowing outside the clipped SVG frame.");
  const element = noteElement({ x: 500, y: 300, width: 180, height: 200 });
  const markup = canvasNotesSvgMarkup([element], false, { "note-1": doc }, { x: -490, y: -290 });

  assert.match(markup, /<rect x="10" y="10" width="180" height="200" rx="8"/);
  assert.ok((markup.match(/<text /g) ?? []).length >= 3, "Long paragraph should wrap across multiple SVG text rows");
  assert.match(markup, /notespace-note-export-clip-0-body/);
});
