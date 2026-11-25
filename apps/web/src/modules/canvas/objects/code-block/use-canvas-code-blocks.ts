import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useState, type MutableRefObject, type RefObject } from "react";
import { defaultCodeBlockView, type CodeBlockViewOptions } from "./CanvasCodeBlockLayer";
import {
  defaultCanvasCodeBlock,
  effectiveCanvasCodeLanguage,
  readCanvasCodeBlock,
  withCanvasCodeBlock,
  type CanvasCodeBlockData,
} from "./model/canvas-code-block";
import {
  CODE_BLOCK_DEFAULT_WIDTH,
  codeBlockHeightChanged,
  codeBlockMinimumHeight,
} from "./model/canvas-code-block-layout";
import { useCodeRunner } from "./execution/use-code-runner";
import { canPreviewHtml } from "./preview/can-preview-html";
import type { CanvasContextMenuCodeProps } from "./CodeBlockContextMenu";
import type { CanvasRuntimeActionName } from "../../selection/CanvasSelectionActions";

export function useCanvasCodeBlocks({
  apiRef,
  surfaceRef,
  expectedAutoFitHeightRef,
  overlayElements,
  selectedElementId,
  selectedElementCount,
  editingCodeBlockId,
  dark,
  onEditingChange,
  onSelectElement,
  onOverlayElementsChange,
  onHasElementsChange,
  onRunCanvasAction,
}: {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  expectedAutoFitHeightRef: MutableRefObject<Map<string, number>>;
  overlayElements: readonly OrderedExcalidrawElement[];
  selectedElementId: string | null;
  selectedElementCount: number;
  editingCodeBlockId: string | null;
  dark: boolean;
  onEditingChange: (id: string | null) => void;
  onSelectElement: (id: string) => void;
  onOverlayElementsChange: (elements: readonly OrderedExcalidrawElement[]) => void;
  onHasElementsChange: (has: boolean) => void;
  onRunCanvasAction: (name: CanvasRuntimeActionName) => void;
}) {
  const [codeBlockViews, setCodeBlockViews] = useState<Record<string, CodeBlockViewOptions>>({});

  const updateCodeView = useCallback((id: string, patch: Partial<CodeBlockViewOptions>) => {
    setCodeBlockViews((current) => ({ ...current, [id]: { ...(current[id] ?? defaultCodeBlockView), ...patch } }));
  }, []);

  const liveCodeBlocks = useMemo(
    () => overlayElements.flatMap((element) => {
      const block = readCanvasCodeBlock(element);
      return block ? [{ id: element.id, code: block.code, language: effectiveCanvasCodeLanguage(block) }] : [];
    }),
    [overlayElements],
  );
  const liveCodeElementIds = useMemo(() => liveCodeBlocks.map(({ id }) => id), [liveCodeBlocks]);
  const { runs: codeRuns, runBlock: executeCodeBlock, stopRun: stopCodeRun, clearRun: clearCodeRun } = useCodeRunner(liveCodeBlocks);

  const runCodeBlock = useCallback((id: string, block: CanvasCodeBlockData) => {
    const language = effectiveCanvasCodeLanguage(block);
    if (canPreviewHtml(language)) {
      updateCodeView(id, { showOutput: true, previewHtml: true });
      return;
    }
    updateCodeView(id, { showOutput: true, previewHtml: false });
    executeCodeBlock(id, { ...block, language });
  }, [executeCodeBlock, updateCodeView]);

  const toggleHtmlPreview = useCallback((id: string) => {
    setCodeBlockViews((current) => {
      const existing = current[id] ?? defaultCodeBlockView;
      const nextPreview = !(existing.showOutput && existing.previewHtml);
      return { ...current, [id]: { ...existing, showOutput: nextPreview, previewHtml: nextPreview } };
    });
  }, []);

  const updateCodeBlock = useCallback((elementId: string, block: CanvasCodeBlockData) => {
    const value = apiRef.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== elementId) return element;
      const previous = readCanvasCodeBlock(element);
      if (!previous) return element;
      if (previous.code !== block.code || previous.language !== block.language) clearCodeRun(elementId);
      if (!canPreviewHtml(effectiveCanvasCodeLanguage(block))) {
        updateCodeView(elementId, { previewHtml: false });
      }
      return newElementWith(element, {
        customData: withCanvasCodeBlock(element.customData, block),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [apiRef, clearCodeRun, updateCodeView]);

  const autoFitCodeBlock = useCallback((elementId: string, targetHeight: number) => {
    const value = apiRef.current;
    if (!value) return;
    const current = value.getSceneElementsIncludingDeleted().find((element) => element.id === elementId);
    const block = current ? readCanvasCodeBlock(current) : null;
    if (!current || !block || block.heightMode !== "auto" || !codeBlockHeightChanged(current.height, targetHeight)) return;
    expectedAutoFitHeightRef.current.set(elementId, targetHeight);
    const elements = value.getSceneElementsIncludingDeleted().map((element) => (
      element.id === elementId ? newElementWith(element, { height: targetHeight }) : element
    )) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [apiRef, expectedAutoFitHeightRef]);

  const insertCodeBlock = useCallback(() => {
    const value = apiRef.current;
    if (!value) return;
    const state = value.getAppState();
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const viewportWidth = bounds?.width ?? 900;
    const viewportHeight = bounds?.height ?? 600;
    const width = CODE_BLOCK_DEFAULT_WIDTH;
    const height = codeBlockMinimumHeight();
    const x = viewportWidth / (2 * state.zoom.value) - state.scrollX - width / 2;
    const y = viewportHeight / (2 * state.zoom.value) - state.scrollY - height / 2;
    const block = defaultCanvasCodeBlock();
    const skeleton: ExcalidrawElementSkeleton = {
      type: "rectangle",
      x,
      y,
      width,
      height,
      strokeColor: dark ? "#4e5257" : "#c9ccd1",
      backgroundColor: dark ? "#2b2b2b" : "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      customData: withCanvasCodeBlock(undefined, block),
    };
    const created = convertToExcalidrawElements([skeleton]) as OrderedExcalidrawElement[];
    const codeElement = created[0];
    if (!codeElement) return;
    const elements = [...value.getSceneElementsIncludingDeleted(), ...created] as OrderedExcalidrawElement[];
    value.updateScene({
      elements,
      appState: { selectedElementIds: { [codeElement.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    value.setActiveTool({ type: "selection" }, { keepSelection: true });
    onSelectElement(codeElement.id);
    onOverlayElementsChange(elements);
    onHasElementsChange(true);
  }, [apiRef, dark, onHasElementsChange, onOverlayElementsChange, onSelectElement, surfaceRef]);

  useEffect(() => {
    if (editingCodeBlockId && (!liveCodeElementIds.includes(editingCodeBlockId) || selectedElementCount !== 1 || selectedElementId !== editingCodeBlockId)) {
      onEditingChange(null);
    }
    setCodeBlockViews((current) => {
      const entries = Object.entries(current).filter(([id]) => liveCodeElementIds.includes(id));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [editingCodeBlockId, liveCodeElementIds, onEditingChange, selectedElementCount, selectedElementId]);

  const selectedCodeElement = selectedElementCount === 1
    ? overlayElements.find((element) => element.id === selectedElementId && !element.isDeleted)
    : undefined;
  const selectedCodeBlock = readCanvasCodeBlock(selectedCodeElement);
  const selectedCodeMenuProps: CanvasContextMenuCodeProps | null = selectedCodeElement && selectedCodeBlock
    ? (() => {
        const view = codeBlockViews[selectedCodeElement.id] ?? defaultCodeBlockView;
        return {
          block: selectedCodeBlock,
          appDark: dark,
          outputVisible: Boolean(view.showOutput),
          wordWrap: view.wordWrap,
          running: codeRuns[selectedCodeElement.id]?.status === "running",
          previewing: Boolean(view.showOutput && view.previewHtml && canPreviewHtml(selectedCodeBlock)),
          onToggleOutput: () => {
            const nextOutput = !view.showOutput;
            updateCodeView(selectedCodeElement.id, { showOutput: nextOutput, previewHtml: nextOutput ? view.previewHtml : false });
          },
          onTogglePreview: () => toggleHtmlPreview(selectedCodeElement.id),
          onToggleWrap: () => updateCodeView(selectedCodeElement.id, { wordWrap: !view.wordWrap }),
          onRun: () => runCodeBlock(selectedCodeElement.id, selectedCodeBlock),
          onStop: () => stopCodeRun(selectedCodeElement.id),
          onDuplicate: () => onRunCanvasAction("duplicateSelection"),
          onUpdate: (block) => updateCodeBlock(selectedCodeElement.id, block),
          onFitContent: () => {
            updateCodeView(selectedCodeElement.id, { fitRevision: (codeBlockViews[selectedCodeElement.id]?.fitRevision ?? 0) + 1 });
            updateCodeBlock(selectedCodeElement.id, { ...selectedCodeBlock, heightMode: "auto" });
          },
          onDelete: () => {
            clearCodeRun(selectedCodeElement.id);
            updateCodeView(selectedCodeElement.id, { showOutput: false, previewHtml: false });
            onEditingChange(null);
            onRunCanvasAction("deleteSelectedElements");
          },
        };
      })()
    : null;

  return {
    codeBlockViews,
    codeRuns,
    runCodeBlock,
    updateCodeBlock,
    autoFitCodeBlock,
    insertCodeBlock,
    selectedCodeElement,
    selectedCodeMenuProps,
  };
}
