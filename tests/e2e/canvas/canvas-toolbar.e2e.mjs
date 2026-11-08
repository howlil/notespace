/* Canvas chrome: tools, linked Note artifacts, embeds, and code-block actions. */
import { after, before, test } from "node:test";
import {
  api, ariaLabel, assert, box, click, cleanupWorkspace, containsText, createWorkspace,
  clickAt, dispatchClick, drag, evaluate, expectAttribute, expectCount, expectText, fill,
  movePointer, notVisible, openWorkspace, press, reload, role, sleep, start, stop, text,
  resetViewport, setViewport, visible, waitFor, waitSaved, within,
} from "../support/harness.mjs";

before(start);
after(stop);

const canvasTools = () => role("toolbar", "Canvas tools");
const canvas = ".excalidraw__canvas.interactive";
const canvasSurface = ".notespace-canvas-surface";

async function openCanvasWorkspace(title) {
  const workspace = await createWorkspace(title);
  await openWorkspace(workspace.id);
  await visible(canvas);
  return workspace.id;
}

async function storedWorkspace(id) {
  return api(`/api/workspaces/${id}`);
}

test("keeps primary tools in the rail and secondary tools in More", async () => {
  const id = await openCanvasWorkspace(`Canvas chrome ${Date.now()}`);
  try {
    const toolbar = canvasTools();
    for (const label of ["Select", "Hand", "Rectangle", "Diamond", "Ellipse", "Arrow", "Line", "Draw", "Text", "Image", "Eraser", "Code block", "Diagram", "More tools"]) {
      await visible(role("button", label, { exact: true, scope: toolbar }));
    }
    await expectCount(role("button", "Colors", { exact: true, scope: toolbar }), 0);
    await expectCount(role("button", "Canvas details", { exact: true, scope: toolbar }), 0);

    const moreTrigger = role("button", "More tools", { exact: true, scope: toolbar });
    await click(role("button", "Draw", { exact: true, scope: toolbar }));
    const penSettings = role("toolbar", "Pen tool settings");
    await visible(penSettings);
    const penBounds = await box(role("button", "Draw", { exact: true, scope: toolbar }));
    const styleBounds = await box(penSettings);
    assert.ok(Math.abs(styleBounds.y + styleBounds.height / 2 - penBounds.y - penBounds.height / 2) < 2, "Tool settings align with the active Pen");
    assert.ok(styleBounds.x >= penBounds.x + penBounds.width && styleBounds.x <= penBounds.x + penBounds.width + 12);
    await click(role("button", "Pen settings", { scope: penSettings }));
    const penPanel = role("dialog", "Pen settings");
    await visible(penPanel);
    const popupBounds = await box(penPanel);
    assert.ok(Math.abs(popupBounds.x - styleBounds.x - styleBounds.width - 4) < 2, "Properties open beside the tool without half-width drift");
    await press("Escape");
    await expectCount(penPanel, 0);
    await expectAttribute(role("button", "Pen settings", { scope: penSettings }), "aria-expanded", "false");
    await expectAttribute(role("button", "Draw", { exact: true, scope: toolbar }), "aria-pressed", "true");
    await click(role("button", "Select", { exact: true, scope: toolbar }));
    await expectCount(penSettings, 0);
    const triggerBox = await box(moreTrigger);
    await movePointer(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
    await sleep(220);
    await expectCount(ariaLabel("More canvas tools"), 0);
    await click(moreTrigger);

    const more = ariaLabel("More canvas tools");
    await visible(more);
    await visible(text("Select", { scope: more }));
    await visible(text("Insert", { scope: more }));
    await visible(role("button", "Lasso select", { scope: more }));
    await visible(role("button", "Embed", { scope: more }));

    const view = role("toolbar", "Canvas view controls");
    await visible(view);
    const optionsTrigger = role("button", "More canvas actions", { scope: view });
    await visible(optionsTrigger);
    await visible(role("button", "Fit canvas", { scope: view }));
    await visible(role("button", "Undo", { scope: view }));
    await click(optionsTrigger);
    const options = role("dialog", "Canvas options");
    await visible(options);
    await visible(role("button", "Grid", { scope: options }));
    await visible(role("button", "Object snapping", { scope: options }));
    await visible(role("button", "Export image", { scope: options }));
    await press("Escape");
    await setViewport(320, 798);
    const surfaceBounds = await box(canvas);
    await clickAt(surfaceBounds.x + surfaceBounds.width / 2, surfaceBounds.y + 160);
    await press("p");
    await visible(penSettings);
    await expectAttribute(penSettings, "aria-orientation", "horizontal");
    const narrowRail = await box(toolbar), narrowStyles = await box(penSettings);
    assert.ok(narrowStyles.y + narrowStyles.height <= narrowRail.y - 3, "Narrow tool settings stay clear of the rail rather than stretching from a legacy bottom offset");
    const activePen = await box(role("button", "Draw", { exact: true, scope: toolbar }));
    const scroller = await box('[aria-label="Canvas tools"] > div:first-child');
    assert.ok(activePen.x >= scroller.x - 1 && activePen.x + activePen.width <= scroller.x + scroller.width + 1, "Keyboard activation reveals the active tool inside the scrolling rail");
    await setViewport(760, 798);
    await click(role("button", "Show Explorer"));
    await expectAttribute(penSettings, "aria-orientation", "horizontal");
    await waitFor(async () => {
      const settings = await box(penSettings), controls = await box(toolbar);
      return settings.y + settings.height <= controls.y - 3;
    }, "Explorer-narrowed Canvas uses the same safe toolbar placement as a phone viewport");
  } finally {
    await resetViewport();
    await cleanupWorkspace(id);
  }
});

test("creates arbitrary HTTPS embeds through the UI without a whitelist toast", { timeout: 120_000 }, async () => {
  const id = await openCanvasWorkspace(`Canvas embed ${Date.now()}`);
  try {
    await click(role("button", "More tools", { exact: true, scope: canvasTools() }));
    const more = ariaLabel("More canvas tools");
    await visible(more);
    await dispatchClick(await within(more, '[aria-label="Embed"]'));
    await visible(role("button", "More tools · Embed", { exact: true, scope: canvasTools() }));

    const bounds = await box(canvas);
    await drag(
      { x: bounds.x + 180, y: bounds.y + 130 },
      { x: bounds.x + 700, y: bounds.y + 450 },
    );
    await press("Control+K");
    await expectCount(role("dialog", "Quick Open"), 0);

    const linkInput = '[placeholder="Type or paste your link here"]';
    await visible(linkInput);
    await fill(linkInput, "https://howlil.tech");
    await press("Enter");

    const frame = 'iframe[src^="https://howlil.tech"]';
    await expectCount(frame, 1);
    await expectCount(text(/Embedding this url is currently not allowed/), 0);
    await waitSaved();

    const stored = await storedWorkspace(id);
    const embed = (stored.canvas.data.elements ?? []).find((element) => !element.isDeleted && element.type === "embeddable");
    assert.equal(embed?.link, "https://howlil.tech");
  } finally {
    await cleanupWorkspace(id);
  }
});

test("code block actions live in the action bar and auto height follows wrapped source", { timeout: 180_000 }, async () => {
  const id = await openCanvasWorkspace(`Canvas code ${Date.now()}`);
  try {
    await click(role("button", "Code block", { exact: true, scope: canvasTools() }));
    const block = "[data-canvas-code-block]";
    const actions = role("toolbar", "Code block actions");
    await visible(block);
    await visible(actions);
    await visible(role("button", "Run JavaScript", { scope: actions }));
    await expectAttribute(role("button", "Fit code height", { scope: actions }), "aria-pressed", "true");
    await expectCount(role("button", /Edit code|Finish editing/, { scope: actions }), 0);

    const initialBox = await box(block);
    assert.ok(initialBox.height < 80, `Empty code block height: ${initialBox.height}`);

    await waitFor(async () => {
      const stored = await storedWorkspace(id);
      const element = (stored.canvas.data.elements ?? []).find((candidate) =>
        !candidate.isDeleted && candidate.customData?.notespaceCodeBlock);
      return element?.customData?.notespaceCodeBlock?.heightMode === "auto";
    }, "Code block height mode must persist as auto");

    const storedInitial = await storedWorkspace(id);
    const initialElement = (storedInitial.canvas.data.elements ?? []).find((candidate) =>
      !candidate.isDeleted && candidate.customData?.notespaceCodeBlock);
    const initialHeight = initialElement?.height ?? 0;

    await evaluate(block, (element) => {
      const rect = element.getBoundingClientRect();
      for (const type of ["pointerdown", "pointerup", "dblclick"]) {
        element.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      }
    });

    const editor = await within(block, '[aria-label="Edit code block"]');
    await visible(editor);
    const longValue = "abcdefghijklmnopqrstuvwxyz".repeat(12);
    const code = `const veryLong = "${longValue}"; console.log("worker-ok"); return veryLong.length;`;
    await fill(editor, code);
    await press("Control+Enter");

    const output = ariaLabel("Code output");
    await containsText(output, "worker-ok");
    await containsText(output, String(longValue.length));
    await waitSaved();

    await waitFor(async () => {
      const stored = await storedWorkspace(id);
      const element = (stored.canvas.data.elements ?? []).find((candidate) =>
        !candidate.isDeleted && candidate.customData?.notespaceCodeBlock?.code === code);
      return Boolean(element) && (element.height ?? 0) > initialHeight;
    }, "Long wrapped source must grow the auto-height code block");

    const stored = await storedWorkspace(id);
    assert.equal(JSON.stringify(stored.canvas.data).includes('"stdout"'), false);

    await reload();
    const reloaded = "[data-canvas-code-block]";
    await visible(reloaded);
    await expectCount(ariaLabel("Code output"), 0);
  } finally {
    await cleanupWorkspace(id);
  }
});

test("directional spawn from a code block creates another code block", { timeout: 120_000 }, async () => {
  const id = await openCanvasWorkspace(`Canvas code spawn ${Date.now()}`);
  try {
    await click(role("button", "Code block", { exact: true, scope: canvasTools() }));
    const blocks = "[data-canvas-code-block]";
    await expectCount(blocks, 1);
    await press("Alt+ArrowRight");
    await expectCount(blocks, 2);

    await waitFor(async () => {
      const stored = await storedWorkspace(id);
      const live = (stored.canvas.data.elements ?? []).filter((element) => !element.isDeleted);
      return live.filter((element) => element.customData?.notespaceCodeBlock).length === 2
        && live.filter((element) => element.type === "arrow").length === 1;
    }, "Spawned code block must be linked to its source");
  } finally {
    await cleanupWorkspace(id);
  }
});

test("property editing suppresses directional spawn affordances and hotkeys", { timeout: 120_000 }, async () => {
  const id = await openCanvasWorkspace(`Canvas property focus ${Date.now()}`);
  try {
    const bounds = await box(canvas);
    await click(role("button", "Rectangle", { exact: true, scope: canvasTools() }));
    await drag(
      { x: bounds.x + 220, y: bounds.y + 180 },
      { x: bounds.x + 360, y: bounds.y + 250 },
    );
    await waitFor(async () => {
      const stored = await storedWorkspace(id);
      return (stored.canvas.data.elements ?? []).filter((element) => !element.isDeleted && element.type === "rectangle").length === 1;
    }, "Rectangle must be durable");

    await movePointer(bounds.x + 354, bounds.y + 215);
    await visible(role("button", "Add connected shape right"));

    const actions = role("toolbar", "Selected shape actions");
    const actionsBox = await box(actions);
    const selectionLeft = bounds.x + 220;
    const selectionRight = bounds.x + 360;
    const selectionTop = bounds.y + 180;
    const centeredOverSelection = Math.abs((actionsBox.x + actionsBox.width / 2) - ((selectionLeft + selectionRight) / 2)) <= 24;
    assert.ok(actionsBox.height <= 48, `Selection actions should be a compact horizontal bar: ${JSON.stringify(actionsBox)}`);
    assert.ok(actionsBox.y + actionsBox.height <= selectionTop && actionsBox.y + actionsBox.height > selectionTop - 48, `Selection toolbar should stay immediately above the selected object: ${JSON.stringify({ actionsBox, selectionTop })}`);
    assert.ok(centeredOverSelection, `Selection toolbar should align with the selected object: ${JSON.stringify({ actionsBox, selectionLeft, selectionRight })}`);
    assert.equal(await (await visible(actions)).getAttribute("aria-orientation"), "horizontal");
    assert.ok(actionsBox.x >= bounds.x + 72, "Selection toolbar must stay clear of the canvas tool rail gutter");
    const moreActions = role("button", "More selected shape actions", { scope: actions });
    await visible(moreActions);
    await click(moreActions);
    const more = role("dialog", "Object actions", { scope: actions });
    await visible(more);
    for (const label of ["Colors", "Object properties", "Duplicate", "Ungroup"]) await expectCount(role("button", label, { exact: true, scope: more }), 0);
    await press("Escape");
    await click(role("button", "Object properties", { scope: actions }));
    await visible(role("dialog", "Object properties"));
    await expectCount(role("button", /Add connected shape/), 0);

    const before = await storedWorkspace(id);
    const beforeCount = (before.canvas.data.elements ?? []).filter((element) => !element.isDeleted).length;
    await press("Alt+ArrowRight");
    await sleep(300);
    const after = await storedWorkspace(id);
    assert.equal((after.canvas.data.elements ?? []).filter((element) => !element.isDeleted).length, beforeCount);

    await click(role("button", "Object properties", { scope: actions }));
    await expectCount(role("dialog", "Object properties"), 0);
    await movePointer(bounds.x + 354, bounds.y + 215);
    await visible(role("button", "Add connected shape right"));

    const retainedToolbar = await visible(actions);
    await drag({ x: bounds.x + 330, y: bounds.y + 182 }, { x: bounds.x + 350, y: bounds.y + 202 });
    assert.equal(await retainedToolbar.isExisting(), true, "Manipulating a selection must not recreate its toolbar");
    await click(role("button", "Rectangle", { exact: true, scope: canvasTools() }));
    await drag({ x: bounds.x + 450, y: bounds.y + 180 }, { x: bounds.x + 580, y: bounds.y + 250 });
    await click(role("button", "Object properties", { exact: true, scope: actions }));
    await click(role("button", "Bold", { exact: true, scope: actions }));
    await click(role("button", "Object properties", { exact: true, scope: actions }));
    await click(role("button", "Select", { exact: true, scope: canvasTools() }));
    await drag({ x: bounds.x + 210, y: bounds.y + 160 }, { x: bounds.x + 610, y: bounds.y + 300 });
    await click(role("button", "Object properties", { exact: true, scope: actions }));
    const properties = role("dialog", "Object properties");
    const widthSection = role("region", "Stroke width", { exact: true, scope: properties });
    await containsText(widthSection, "Mixed");
    await expectAttribute(role("button", "Thin", { exact: true, scope: widthSection }), "aria-pressed", "false");
    await visible(role("region", "Corners", { exact: true, scope: properties }));
    await click(role("button", "Medium", { exact: true, scope: widthSection }));
    await click(role("button", "Undo", { exact: true, scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Object properties", { exact: true, scope: actions }));
    await containsText(widthSection, "Mixed");
    await click(role("button", "Redo", { exact: true, scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Object properties", { exact: true, scope: actions }));
    await expectAttribute(role("button", "Medium", { exact: true, scope: widthSection }), "aria-pressed", "true");
    await click(role("button", "Object properties", { exact: true, scope: actions }));
    await click(role("button", "More selected shape actions", { scope: actions }));
    await click(role("button", "Group selection", { exact: true, scope: actions }));
    await click(role("button", "More selected shape actions", { scope: actions }));
    await visible(role("button", "Ungroup", { exact: true, scope: actions }));
    await click(role("button", "Ungroup", { exact: true, scope: actions }));

    await click(role("button", "Arrow", { exact: true, scope: canvasTools() }));
    await drag(
      { x: bounds.x + 450, y: bounds.y + 300 },
      { x: bounds.x + 600, y: bounds.y + 350 },
    );
    await visible(role("button", "Arrow properties", { scope: actions }));
    const quickCount = await evaluate(actions, (toolbar) => toolbar.querySelectorAll(':scope > div:not([role="dialog"]) > button').length);
    assert.ok(quickCount <= 4, "At most three quick actions plus More are visible");
    await click(role("button", "More selected shape actions", { scope: actions }));
    const overflow = role("dialog", "Object actions", { scope: actions });
    await visible(overflow);
    await click(role("button", "Object properties", { scope: overflow }));
    await visible('.notespace-selection-actions input[aria-label="Opacity"]');
    await press("Escape");
    await clickAt(bounds.x + 525, bounds.y + 325, { button: 2 });
    await visible(".excalidraw .context-menu");
    await expectCount(actions, 0);
    await press("Escape");
    await notVisible(".excalidraw .context-menu");
    await visible(actions);

    await click(role("button", "Draw", { exact: true, scope: canvasTools() }));
    await drag({ x: bounds.x + 240, y: bounds.y + 440 }, { x: bounds.x + 470, y: bounds.y + 460 });
    await drag({ x: bounds.x + 280, y: bounds.y + 520 }, { x: bounds.x + 440, y: bounds.y + 540 });
    await click(role("button", "Select", { exact: true, scope: canvasTools() }));
    await drag({ x: bounds.x + 210, y: bounds.y + 420 }, { x: bounds.x + 500, y: bounds.y + 560 });
    await click(role("button", "Object properties", { exact: true, scope: actions }));
    await visible(role("region", "Pressure", { exact: true, scope: properties }));
    await click(role("button", "Constant pressure", { exact: true, scope: properties }));
    await waitFor(async () => {
      const stored = await storedWorkspace(id);
      const pens = stored.canvas.data.elements.filter((element) => !element.isDeleted && element.type === "freedraw");
      const rectangles = stored.canvas.data.elements.filter((element) => !element.isDeleted && element.type === "rectangle");
      return pens.length === 2 && pens.every((pen) => pen.strokeOptions.variability === "constant")
        && rectangles.length === 2 && rectangles.every((rectangle) => rectangle.strokeWidth === 2);
    }, "Batch pen properties and both rectangle widths persist together");
  } finally {
    await cleanupWorkspace(id);
  }
});

test("slash opens Diagram search and Escape closes it", async () => {
  const id = await openCanvasWorkspace(`Canvas diagram ${Date.now()}`);
  try {
    await click(canvasSurface);
    await press("/");
    const diagram = ariaLabel("Diagram tools");
    await visible(diagram);
    await expectText(role("textbox", "Search diagram components"), "");
    await press("Escape");
    await notVisible(diagram);
  } finally {
    await cleanupWorkspace(id);
  }
});
