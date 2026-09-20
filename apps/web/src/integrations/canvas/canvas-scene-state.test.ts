import assert from "node:assert/strict";
import test from "node:test";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { defaultCanvasCodeBlock, withCanvasCodeBlock } from "./canvas-code-block.ts";
import { deriveCanvasElementState, sameElementVersions } from "./canvas-scene-state.ts";

function codeElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "code-1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    angle: 0,
    strokeColor: "#111",
    backgroundColor: "#fff",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: "a0",
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    customData: withCanvasCodeBlock({}, defaultCanvasCodeBlock()),
    ...overrides,
  } as unknown as OrderedExcalidrawElement;
}

function normalizeManualHeight(element: OrderedExcalidrawElement, block: ReturnType<typeof defaultCanvasCodeBlock>) {
  return {
    ...element,
    customData: withCanvasCodeBlock(element.customData, block),
  } as OrderedExcalidrawElement;
}

test("canvas element derivation keeps non-code elements out of the HTML overlay", () => {
  const code = codeElement();
  const ordinary = { ...codeElement({ id: "shape-1", customData: undefined }), type: "rectangle" } as OrderedExcalidrawElement;
  const result = deriveCanvasElementState([ordinary, code], new Map(), new Map(), normalizeManualHeight);

  assert.equal(result.hasLiveElements, true);
  assert.deepEqual(result.codeElements.map((element) => element.id), ["code-1"]);
  assert.equal(result.codeGeometry.get("code-1")?.width, 320);
});

test("canvas element derivation converts a user-resized auto code block to manual height", () => {
  const previous = codeElement({ height: 180 });
  const resized = codeElement({ height: 240, version: 2, versionNonce: 2 });
  const result = deriveCanvasElementState(
    [resized],
    new Map([["code-1", { width: previous.width, height: previous.height }]]),
    new Map(),
    normalizeManualHeight,
  );

  assert.equal(result.normalizedManualResize, true);
  const customData = result.authoredElements[0].customData as { notespaceCodeBlock?: { heightMode?: string } } | undefined;
  assert.equal(customData?.notespaceCodeBlock?.heightMode, "manual");
});

test("canvas element derivation acknowledges expected auto-fit height without switching modes", () => {
  const resized = codeElement({ height: 220, version: 2, versionNonce: 2 });
  const result = deriveCanvasElementState(
    [resized],
    new Map([["code-1", { width: 320, height: 180 }]]),
    new Map([["code-1", 220]]),
    normalizeManualHeight,
  );

  assert.deepEqual(result.acknowledgedAutoFitIds, ["code-1"]);
  assert.equal(result.normalizedManualResize, false);
});

test("element version equality only changes when render-relevant geometry/version changes", () => {
  const element = codeElement();
  assert.equal(sameElementVersions([element], [element]), true);
  assert.equal(sameElementVersions([element], [codeElement({ version: 2 })]), false);
});
