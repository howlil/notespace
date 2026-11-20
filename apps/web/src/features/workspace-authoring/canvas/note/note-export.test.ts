import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  NOTE_CARD_COLORS,
  withCanvasNoteReference,
  type CanvasNoteReference,
  type NoteDocument,
} from "../../../../domain/note/note.ts";
import {
  canvasNotesSvgMarkup,
  noteCardSurfaceColors,
  type NoteSceneElement,
} from "./note-export.ts";

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
  const doc: NoteDocument = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Distributed Consensus Protocol Architecture Overview For Production Clusters" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Body paragraph that must not appear while compact." }],
      },
    ],
  };
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

test("rich unfolded Note card renders headings, lists, checklists, callouts, toggles, code, math, tables, images, and color", () => {
  const doc: NoteDocument = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Architecture Plan" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Latency scales with " },
          { type: "inlineMath", attrs: { latex: "O(n \\log n)" } },
          { type: "text", text: " in steady state." },
        ],
      },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Bullet point" }] }] }],
      },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First step" }] }] }],
      },
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Pending task" }] }] },
          { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Completed task" }] }] },
        ],
      },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted principle" }] }],
      },
      {
        type: "noteCallout",
        attrs: { tone: "warning" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Watch lock contention" }] }],
      },
      {
        type: "noteToggle",
        attrs: { open: true },
        content: [
          { type: "noteToggleSummary", content: [{ type: "text", text: "Expanded section" }] },
          { type: "paragraph", content: [{ type: "text", text: "Visible toggle detail" }] },
        ],
      },
      {
        type: "noteToggle",
        attrs: { open: false },
        content: [
          { type: "noteToggleSummary", content: [{ type: "text", text: "Collapsed section" }] },
          { type: "paragraph", content: [{ type: "text", text: "Hidden toggle detail" }] },
        ],
      },
      {
        type: "codeBlock",
        content: [{ type: "text", text: "const quorum = Math.floor(n / 2) + 1;" }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Node" }] }] },
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Role" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "n1" }] }] },
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Leader" }] }] },
            ],
          },
        ],
      },
      {
        type: "noteImage",
        attrs: { src: "https://example.invalid/diagram.png", alt: "Cluster topology" },
      },
    ],
  };

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
  assert.doesNotMatch(markup, /https:\/\/example\.invalid/);
  assert.doesNotMatch(markup, /<foreignObject\b|<image\b|<img\b/i);
});

test("dark mode renders distinct dark surfaces and borders for every card color", () => {
  const doc: NoteDocument = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Dark card content" }] }],
  };

  for (const color of NOTE_CARD_COLORS) {
    const lightSurface = noteCardSurfaceColors(color, false);
    const darkSurface = noteCardSurfaceColors(color, true);
    const markup = canvasNotesSvgMarkup([noteElement({}, { color })], true, { "note-1": doc });
    assert.match(markup, new RegExp(`fill="${darkSurface.background}" stroke="${darkSurface.border}"`));
    if (color === "default") {
      assert.notEqual(lightSurface.background, darkSurface.background, "default card background should differ by theme");
      assert.notEqual(lightSurface.border, darkSurface.border, "default card border should differ by theme");
      assert.match(markup, /fill="#E8E8EF"/);
    } else {
      // A colored card is a vivid sticky in both themes, so it keeps the same hue and dark ink.
      assert.deepEqual(lightSurface, darkSurface, `${color} card should look the same in both themes`);
      assert.doesNotMatch(markup, /fill="#E8E8EF"/, `${color} card must not use light dark-theme ink`);
      assert.match(markup, /fill="#14151A"/);
    }
  }
});

test("square cards export with sharp corners and rounded cards keep the default radius", () => {
  const doc: NoteDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Shape" }] }] };
  const rounded = canvasNotesSvgMarkup([noteElement({}, {})], false, { "note-1": doc });
  const square = canvasNotesSvgMarkup([noteElement({}, { shape: "square" })], false, { "note-1": doc });
  assert.match(rounded, /rx="8" fill="#FFFFFF"/);
  assert.match(square, /rx="0" fill="#FFFFFF"/);
  assert.doesNotMatch(square, /<clipPath[^>]*><rect[^>]*rx="[1-9]/);
});

test("SVG export escapes XML special characters and skips deleted, plain, and malformed elements", () => {
  const doc: NoteDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: `<script>alert("xss" & '1')</script>` }],
      },
      {
        type: "noteImage",
        attrs: { alt: `<img src=x onerror="alert(1)">` },
      },
    ],
  };

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

  const emptyDoc: NoteDocument = { type: "doc", content: [{ type: "paragraph", content: [] }] };
  const emptyMarkup = canvasNotesSvgMarkup([noteElement()], false, { "note-1": emptyDoc });
  assert.match(emptyMarkup, /rx="8"/);
  assert.match(emptyMarkup, /<tspan>Empty note<\/tspan>/);

  const compactMissingMarkup = canvasNotesSvgMarkup([noteElement({ height: 48 }, { compact: true })], false);
  assert.match(compactMissingMarkup, /<tspan>Note<\/tspan>/);
});

test("word wrapping splits long paragraphs to card inner width and applies export offset", () => {
  const doc: NoteDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{
          type: "text",
          text: "Word wrapping keeps narrow Note cards readable without overflowing outside the clipped SVG frame.",
        }],
      },
    ],
  };
  const element = noteElement({ x: 500, y: 300, width: 180, height: 200 });
  const markup = canvasNotesSvgMarkup([element], false, { "note-1": doc }, { x: -490, y: -290 });

  assert.match(markup, /<rect x="10" y="10" width="180" height="200" rx="8"/);
  assert.ok((markup.match(/<text /g) ?? []).length >= 3, "Long paragraph should wrap across multiple SVG text rows");
  assert.match(markup, /notespace-note-export-clip-0-body/);
});
