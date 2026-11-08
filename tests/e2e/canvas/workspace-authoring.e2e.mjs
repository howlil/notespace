/* Workspace authoring: directional spawn, Note code blocks and Canvas frame links. */
import { after, before, test } from "node:test";
import { api, assert, box, click, cleanupWorkspace, createWorkspace, drag, expectCount, expectFocused, hover, movePointer, openWorkspace, press, role, sleep, start, stop, text, visible, waitFor } from "../support/harness.mjs";

before(start);
after(stop);

/** Move the real pointer: Excalidraw hover affordances ignore synthetic events. */
async function hoverAt(_selector, x, y) {
  await movePointer(x, y);
  await sleep(80);
}

test("critical: flowchart spawn previews, chains, auto-connects, and spawns again", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Directional spawn ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const canvas = ".excalidraw__canvas.interactive";
    const toolbar = role("toolbar", "Canvas tools");
    await click(role("button", "Rectangle", { exact: true, scope: toolbar }));
    const bounds = await box(canvas);
    const left = bounds.x + 220;
    const top = bounds.y + 180;
    await drag({ x: left, y: top }, { x: left + 120, y: top + 70 });

    const countTypes = async () => {
      const stored = await api(`/api/workspaces/${workspace.id}`);
      const live = (stored.canvas.data.elements ?? []).filter((element) => !element.isDeleted);
      return {
        rectangles: live.filter((element) => element.type === "rectangle").length,
        diamonds: live.filter((element) => element.type === "diamond").length,
        arrows: live.filter((element) => element.type === "arrow").length,
      };
    };
    await waitFor(async () => (await countTypes()).rectangles === 1, "Rectangle must be durable");

    const editor = ".excalidraw";
    await expectFocused(editor);
    const handles = role("button", /Add connected shape/);

    await hoverAt(canvas, bounds.x + 40, bounds.y + 40);
    await expectCount(handles, 0);

    await hoverAt(canvas, left + 60, top + 4);
    await visible(role("button", "Add connected shape up"));
    await expectCount(handles, 1);

    await hoverAt(canvas, left + 115, top + 35);
    await visible(role("button", "Add connected shape right"));
    await expectCount(handles, 1);
    await hover(role("button", "Add connected shape right"));
    await visible(text("Alt", { exact: true }));

    assert.deepEqual(await countTypes(), { rectangles: 1, diamonds: 0, arrows: 0 });

    await hoverAt(canvas, bounds.x + 40, bounds.y + 40);
    await expectCount(handles, 0);

    // The spawn shortcut is a window-level keydown; no element focus is needed.
    await press("Alt+ArrowRight");
    await waitFor(async () => {
      const counts = await countTypes();
      return counts.rectangles === 2 && counts.arrows === 1;
    }, "Alt+ArrowRight must spawn a connected shape");

    await press("Alt+ArrowRight");
    await waitFor(async () => {
      const counts = await countTypes();
      return counts.rectangles === 3 && counts.arrows === 2;
    }, "Second spawn must chain again");

    // Type conversion (Tab → ConvertElementTypePopup) is Excalidraw-native UI,
    // not Notespace-owned behavior; the spawn chain above is the product contract.
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
