import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { getNote, type CreateNoteInstanceRequest, type CreateNoteInstanceResult } from "../../../../adapters/http/note-api";
import { DIAGRAM_DATA_KEY, type StructuredDiagram } from "../../../../domain/diagram/diagram";
import {
  emptyNoteDocument,
  notePlacement,
  readCanvasNoteReference,
  withCanvasNoteReference,
  type CanvasNoteReference,
} from "../../../../domain/note/note";
import type { Snapshot } from "../../../../domain/workspace/workspace";
import type { ToastInput } from "../../../../shared/ui/feedback/toast-provider";
import { codeOverlayElements, persistedAppState, sceneSignature } from "../state/canvas-scene-state";
import type { NoteActivationPoint } from "./CanvasNoteCardLayer";
import { clampNoteAutoHeight, NOTE_CARD_MIN_HEIGHT, noteHeightChanged } from "./note-card-layout";

type UseCanvasNotesParams = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  workspaceId: string;
  dark: boolean;
  canvasVersion: number;
  diagrams: readonly StructuredDiagram[];
  diagramsRef: MutableRefObject<readonly StructuredDiagram[]>;
  expectedAutoFitHeightRef: MutableRefObject<Map<string, number>>;
  lastRef: MutableRefObject<string>;
  lastExternalSceneRef: MutableRefObject<string>;
  sceneElements: readonly OrderedExcalidrawElement[];
  selectedElementId: string | null;
  selectedElementCount: number;
  editingNoteElementId: string | null;
  canvasOverlayInteractionActive: boolean;
  viewModeEnabled: boolean;
  onCreateNote?: (request: CreateNoteInstanceRequest) => Promise<CreateNoteInstanceResult>;
  onDeleteNoteInstance?: (
    workspaceId: string,
    instanceId: string,
    canvas: Snapshot,
    expectedCanvasVersion: number,
  ) => Promise<{ canvas: Snapshot; version: number; updatedAt: string }>;
  setSceneElements: (elements: readonly OrderedExcalidrawElement[]) => void;
  setOverlayElements: (elements: readonly OrderedExcalidrawElement[]) => void;
  setHasElements: (has: boolean) => void;
  setSelectedElementCount: (count: number) => void;
  setSelectedElementId: (id: string | null) => void;
  setEditingNoteElementId: (id: string | null) => void;
  focusCanvasEditor: () => void;
  emitSnapshot: (
    elements: readonly OrderedExcalidrawElement[],
    state: AppState,
    nextDiagrams: readonly StructuredDiagram[],
  ) => void;
  showToast: (input: ToastInput) => string;
};

export function useCanvasNotes({
  apiRef,
  surfaceRef,
  workspaceId,
  dark,
  canvasVersion,
  diagrams,
  diagramsRef,
  expectedAutoFitHeightRef,
  lastRef,
  lastExternalSceneRef,
  sceneElements,
  selectedElementId,
  selectedElementCount,
  editingNoteElementId,
  canvasOverlayInteractionActive,
  viewModeEnabled,
  onCreateNote,
  onDeleteNoteInstance,
  setSceneElements,
  setOverlayElements,
  setHasElements,
  setSelectedElementCount,
  setSelectedElementId,
  setEditingNoteElementId,
  focusCanvasEditor,
  emitSnapshot,
  showToast,
}: UseCanvasNotesParams) {
  const [noteActivationPoint, setNoteActivationPoint] = useState<NoteActivationPoint | null>(null);
  const noteFlushRef = useRef<() => Promise<void>>(async () => {});
  const pendingNoteCopies = useRef(false);
  const canvasVersionRef = useRef(canvasVersion);
  canvasVersionRef.current = canvasVersion;
  const onCreateNoteRef = useRef(onCreateNote);
  onCreateNoteRef.current = onCreateNote;
  const onDeleteNoteInstanceRef = useRef(onDeleteNoteInstance);
  onDeleteNoteInstanceRef.current = onDeleteNoteInstance;

  const startNoteEditing = useCallback((elementId: string, point: NoteActivationPoint | null = null) => {
    setSelectedElementCount(1);
    setSelectedElementId(elementId);
    setNoteActivationPoint(point);
    setEditingNoteElementId(elementId);
  }, [setEditingNoteElementId, setSelectedElementCount, setSelectedElementId]);

  const finishNoteEditing = useCallback((elementId: string | null) => {
    if (elementId === null) setNoteActivationPoint(null);
    setEditingNoteElementId(elementId);
    if (elementId === null) focusCanvasEditor();
  }, [focusCanvasEditor, setEditingNoteElementId]);

  useEffect(() => {
    if (!editingNoteElementId) return;
    const stillLive = sceneElements.some(
      (element) => element.id === editingNoteElementId && !element.isDeleted && Boolean(readCanvasNoteReference(element)),
    );
    if (!stillLive || selectedElementCount !== 1 || selectedElementId !== editingNoteElementId) {
      setNoteActivationPoint(null);
      setEditingNoteElementId(null);
    }
  }, [editingNoteElementId, sceneElements, selectedElementCount, selectedElementId, setEditingNoteElementId]);

  const syncNoteCanvas = useCallback((
    canvas: Snapshot,
    fallbackElements: readonly OrderedExcalidrawElement[],
    selectElementId?: string | null,
  ) => {
    const value = apiRef.current;
    if (!value) return;
    const data = canvas.data as { elements?: OrderedExcalidrawElement[] };
    const elements = Array.isArray(data.elements) ? data.elements : fallbackElements;
    lastExternalSceneRef.current = sceneSignature(canvas.data);
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    const syncedElements = value.getSceneElementsIncludingDeleted();
    lastRef.current = JSON.stringify({
      elements: syncedElements,
      appState: persistedAppState(value.getAppState()),
      files: {},
      [DIAGRAM_DATA_KEY]: diagramsRef.current,
    });
    setSceneElements(syncedElements);
    setOverlayElements(codeOverlayElements(syncedElements));
    setHasElements(syncedElements.some((element) => !element.isDeleted));
    if (selectElementId !== undefined) {
      value.updateScene({
        appState: { selectedElementIds: selectElementId ? { [selectElementId]: true } : {} },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      setSelectedElementCount(selectElementId ? 1 : 0);
      setSelectedElementId(selectElementId);
    }
  }, [apiRef, diagramsRef, lastExternalSceneRef, lastRef, setHasElements, setOverlayElements, setSceneElements, setSelectedElementCount, setSelectedElementId]);

  const restoreRemovedNote = useCallback(async (removedElement: OrderedExcalidrawElement, reference: CanvasNoteReference) => {
    const value = apiRef.current;
    const createNote = onCreateNoteRef.current;
    if (!value || !createNote) return;
    const instanceId = crypto.randomUUID();
    const provisional = convertToExcalidrawElements([{
      type: "rectangle",
      x: removedElement.x,
      y: removedElement.y,
      width: removedElement.width,
      height: removedElement.height,
      strokeColor: removedElement.strokeColor,
      backgroundColor: removedElement.backgroundColor,
      fillStyle: "solid",
      strokeWidth: removedElement.strokeWidth,
      roughness: 0,
      roundness: removedElement.roundness,
      opacity: removedElement.opacity,
    } as ExcalidrawElementSkeleton])[0] as OrderedExcalidrawElement | undefined;
    if (!provisional) return;
    const restoredElement = newElementWith(provisional, {
      customData: withCanvasNoteReference(provisional.customData, { ...reference, instanceId }),
    });
    const elements = [...value.getSceneElementsIncludingDeleted(), restoredElement] as OrderedExcalidrawElement[];
    const state = value.getAppState();
    const data = { elements, appState: persistedAppState(state), files: {}, [DIAGRAM_DATA_KEY]: diagramsRef.current };
    try {
      const created = await createNote({
        clientRequestId: crypto.randomUUID(),
        clientNoteId: reference.noteId,
        clientInstanceId: instanceId,
        existingNoteId: reference.noteId,
        elementId: restoredElement.id,
        expectedCanvasVersion: canvasVersionRef.current,
        canvas: { format: "excalidraw", version: 1, data },
        x: restoredElement.x,
        y: restoredElement.y,
        width: restoredElement.width,
        height: restoredElement.height,
        compact: reference.compact === true,
      });
      canvasVersionRef.current = Math.max(canvasVersionRef.current, created.canvas.version);
      syncNoteCanvas(created.canvas.canvas, elements, restoredElement.id);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not restore this Note." });
    }
  }, [apiRef, diagramsRef, showToast, syncNoteCanvas]);

  const deleteSelectedNote = useCallback(() => {
    const value = apiRef.current;
    const deleteInstance = onDeleteNoteInstanceRef.current;
    if (!value || !deleteInstance) return false;
    const selectedIds = Object.entries(value.getAppState().selectedElementIds).filter(([, selected]) => selected).map(([id]) => id);
    const targetId = selectedIds.length === 1 ? selectedIds[0] : (selectedElementCount === 1 ? selectedElementId : null);
    if (!targetId) return false;
    const selected = value.getSceneElementsIncludingDeleted().find((element) => element.id === targetId && !element.isDeleted);
    const reference = readCanvasNoteReference(selected);
    if (!selected || !reference) return false;
    const state = value.getAppState();
    const deletedElement = newElementWith(selected, { isDeleted: true });
    const elements = value.getSceneElementsIncludingDeleted().map((element) => element.id === selected.id ? deletedElement : element) as OrderedExcalidrawElement[];
    const data = { elements, appState: persistedAppState(state), files: {}, [DIAGRAM_DATA_KEY]: diagrams };
    void deleteInstance(workspaceId, reference.instanceId, { format: "excalidraw", version: 1, data }, canvasVersionRef.current)
      .then((result) => {
        canvasVersionRef.current = Math.max(canvasVersionRef.current, result.version);
        syncNoteCanvas(result.canvas, elements, null);
        finishNoteEditing(null);
        showToast({
          kind: "info",
          message: "Note removed from Canvas. The Note itself remains.",
          action: {
            label: "Undo",
            onClick: () => {
              void restoreRemovedNote(deletedElement, reference);
            },
          },
        });
      })
      .catch((error: unknown) => showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not remove this Note." }));
    return true;
  }, [apiRef, diagrams, finishNoteEditing, restoreRemovedNote, selectedElementCount, selectedElementId, showToast, syncNoteCanvas, workspaceId]);

  const removeMissingNote = useCallback((elementId: string) => {
    const value = apiRef.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => (
      element.id === elementId ? newElementWith(element, { isDeleted: true }) : element
    )) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSceneElements(elements);
    setOverlayElements(codeOverlayElements(elements));
    setHasElements(elements.some((element) => !element.isDeleted));
    finishNoteEditing(null);
    emitSnapshot(elements, value.getAppState(), diagramsRef.current);
  }, [apiRef, diagramsRef, emitSnapshot, finishNoteEditing, setHasElements, setOverlayElements, setSceneElements]);

  const duplicateSelectedNote = useCallback(() => {
    const value = apiRef.current;
    if (!value || !onCreateNote) return false;
    const selectedIds = Object.entries(value.getAppState().selectedElementIds).filter(([, selected]) => selected).map(([id]) => id);
    const targetId = selectedIds.length === 1 ? selectedIds[0] : (selectedElementCount === 1 ? selectedElementId : null);
    if (!targetId) return false;
    const selected = value.getSceneElementsIncludingDeleted().find((element) => element.id === targetId && !element.isDeleted);
    const reference = readCanvasNoteReference(selected);
    if (!selected || !reference) return false;
    const state = value.getAppState();
    const duplicate = convertToExcalidrawElements([{
      type: "rectangle",
      x: selected.x + 32,
      y: selected.y + 32,
      width: selected.width,
      height: selected.height,
      strokeColor: selected.strokeColor,
      backgroundColor: selected.backgroundColor,
      fillStyle: "solid",
      strokeWidth: selected.strokeWidth,
      roughness: 0,
      roundness: selected.roundness,
      opacity: selected.opacity,
    } as ExcalidrawElementSkeleton])[0] as OrderedExcalidrawElement | undefined;
    if (!duplicate) return false;
    const newNoteId = crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    const duplicateWithReference = newElementWith(duplicate, {
      customData: withCanvasNoteReference(duplicate.customData, {
        noteId: newNoteId,
        instanceId,
        ...(reference.heightMode ? { heightMode: reference.heightMode } : {}),
      }),
    });
    const elements = [...value.getSceneElementsIncludingDeleted(), duplicateWithReference] as OrderedExcalidrawElement[];
    const data = { elements, appState: persistedAppState(state), files: {}, [DIAGRAM_DATA_KEY]: diagrams };
    void getNote(reference.noteId).then((source) => {
      const createNote = onCreateNoteRef.current;
      if (!createNote) throw new Error("Could not duplicate this Note.");
      return createNote({
        clientRequestId: crypto.randomUUID(),
        clientNoteId: newNoteId,
        clientInstanceId: instanceId,
        document: source.document,
        elementId: duplicateWithReference.id,
        expectedCanvasVersion: canvasVersionRef.current,
        canvas: { format: "excalidraw", version: 1, data },
        x: duplicateWithReference.x,
        y: duplicateWithReference.y,
        width: duplicateWithReference.width,
        height: duplicateWithReference.height,
      });
    }).then((result) => {
      canvasVersionRef.current = Math.max(canvasVersionRef.current, result.canvas.version);
      syncNoteCanvas(result.canvas.canvas, elements, duplicateWithReference.id);
    }).catch((error: unknown) => showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not duplicate this Note." }));
    return true;
  }, [apiRef, diagrams, onCreateNote, selectedElementCount, selectedElementId, showToast, syncNoteCanvas]);

  const insertNote = useCallback(async (linkedNoteId?: string) => {
    const value = apiRef.current;
    if (!value || !onCreateNote) return;
    const state = value.getAppState();
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const width = 320;
    const height = NOTE_CARD_MIN_HEIGHT;
    const placement = notePlacement({
      viewportWidth: bounds?.width ?? 900,
      viewportHeight: bounds?.height ?? 600,
      zoom: state.zoom.value,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      width,
      height,
      occupied: value.getSceneElementsIncludingDeleted(),
    });
    const noteId = linkedNoteId ?? crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    const skeleton: ExcalidrawElementSkeleton = {
      type: "rectangle",
      x: placement.x,
      y: placement.y,
      width,
      height,
      strokeColor: dark ? "#68707a" : "#b8bec7",
      backgroundColor: dark ? "#25282d" : "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      opacity: 0,
    };
    const converted = convertToExcalidrawElements([skeleton]) as OrderedExcalidrawElement[];
    const provisional = converted[0];
    if (!provisional) return;
    const noteElement = newElementWith(provisional, {
      customData: withCanvasNoteReference(provisional.customData, { noteId, instanceId }),
    });
    const elements = [...value.getSceneElementsIncludingDeleted(), noteElement] as OrderedExcalidrawElement[];
    const data = {
      elements,
      appState: persistedAppState(state),
      files: {},
      [DIAGRAM_DATA_KEY]: diagrams,
    };
    try {
      const created = await onCreateNote({
        clientRequestId: crypto.randomUUID(),
        clientNoteId: noteId,
        clientInstanceId: instanceId,
        elementId: noteElement.id,
        expectedCanvasVersion: canvasVersionRef.current,
        ...(linkedNoteId ? { existingNoteId: linkedNoteId } : { document: emptyNoteDocument() }),
        canvas: { format: "excalidraw", version: 1, data },
        x: placement.x,
        y: placement.y,
        width,
        height,
      });
      canvasVersionRef.current = Math.max(canvasVersionRef.current, created.canvas.version);
      const authoritative = created.canvas.canvas.data as { elements?: OrderedExcalidrawElement[] };
      const authoritativeElements = Array.isArray(authoritative.elements) ? authoritative.elements : elements;
      const authoritativeData = created.canvas.canvas.data;
      lastExternalSceneRef.current = sceneSignature(authoritativeData);
      value.updateScene({ elements: authoritativeElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      const syncedElements = value.getSceneElementsIncludingDeleted();
      lastRef.current = JSON.stringify({
        elements: syncedElements,
        appState: persistedAppState(value.getAppState()),
        files: {},
        [DIAGRAM_DATA_KEY]: diagramsRef.current,
      });
      setSceneElements(syncedElements);
      setOverlayElements(codeOverlayElements(syncedElements));
      setHasElements(syncedElements.some((element) => !element.isDeleted));
      value.updateScene({ appState: { selectedElementIds: { [noteElement.id]: true } }, captureUpdate: CaptureUpdateAction.NEVER });
      setSelectedElementCount(1);
      setSelectedElementId(noteElement.id);
      if (!linkedNoteId) startNoteEditing(noteElement.id, null);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not create this Note." });
    }
  }, [apiRef, dark, diagrams, diagramsRef, lastExternalSceneRef, lastRef, onCreateNote, setHasElements, setOverlayElements, setSceneElements, setSelectedElementCount, setSelectedElementId, showToast, startNoteEditing, surfaceRef]);

  const placeLinkedNote = useCallback(async (noteId: string) => {
    await insertNote(noteId);
  }, [insertNote]);

  const applyNoteHeight = useCallback((elementId: string, height: number, forceAuto: boolean) => {
    const value = apiRef.current;
    if (!value || !Number.isFinite(height)) return;
    const current = value.getSceneElementsIncludingDeleted().find((element) => element.id === elementId && !element.isDeleted);
    const reference = readCanvasNoteReference(current);
    if (!current || !reference) return;
    if (!forceAuto && reference.heightMode === "fixed") return;
    const nextHeight = clampNoteAutoHeight(height);
    const nextReference: CanvasNoteReference = forceAuto && reference.heightMode === "fixed"
      ? { ...reference, heightMode: "auto" }
      : reference;
    if (!noteHeightChanged(current.height, nextHeight) && nextReference === reference) return;
    expectedAutoFitHeightRef.current.set(elementId, nextHeight);
    const elements = value.getSceneElementsIncludingDeleted().map((element) => (
      element.id === elementId
        ? newElementWith(element, {
          height: nextHeight,
          ...(nextReference !== reference ? { customData: withCanvasNoteReference(element.customData, nextReference) } : {}),
        })
        : element
    )) as OrderedExcalidrawElement[];
    // Automatic height fitting never adds an Undo step (B9b).
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    setSceneElements(elements);
    if (forceAuto) {
      emitSnapshot(elements, value.getAppState(), diagramsRef.current);
    }
  }, [apiRef, diagramsRef, emitSnapshot, expectedAutoFitHeightRef, setSceneElements]);

  const resizeNote = useCallback((elementId: string, height: number) => {
    applyNoteHeight(elementId, height, false);
  }, [applyNoteHeight]);

  const fitNoteContent = useCallback((elementId: string) => {
    const contentNode = surfaceRef.current?.querySelector<HTMLElement>(
      `[data-note-element="${CSS.escape(elementId)}"] .notespace-note-content`,
    );
    const measured = contentNode ? Math.max(NOTE_CARD_MIN_HEIGHT, Math.ceil(contentNode.scrollHeight + 24)) : NOTE_CARD_MIN_HEIGHT;
    applyNoteHeight(elementId, measured, true);
  }, [applyNoteHeight, surfaceRef]);

  const toggleFoldNote = useCallback((elementId: string, reference: CanvasNoteReference) => {
    if (editingNoteElementId === elementId) finishNoteEditing(null);
    const value = apiRef.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => (
      element.id === elementId
        ? newElementWith(element, {
          customData: withCanvasNoteReference(element.customData, { ...reference, compact: reference.compact !== true }),
        })
        : element
    )) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSceneElements(elements);
    setOverlayElements(codeOverlayElements(elements));
  }, [apiRef, editingNoteElementId, finishNoteEditing, setOverlayElements, setSceneElements]);

  const resolveNativeNoteCopies = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, copyIds: string[]) => {
    const value = apiRef.current;
    if (!value || !onCreateNote || pendingNoteCopies.current) return;
    const plans = copyIds.flatMap((elementId) => {
      const reference = readCanvasNoteReference(elements.find((element) => element.id === elementId));
      return reference ? [{ elementId, sourceNoteId: reference.noteId, noteId: crypto.randomUUID(), instanceId: crypto.randomUUID() }] : [];
    });
    if (!plans.length) return;
    pendingNoteCopies.current = true;
    void (async () => {
      let base: readonly OrderedExcalidrawElement[] = elements;
      let version = canvasVersion;
      let latest: Snapshot | null = null;
      let remaining = plans;
      try {
        await noteFlushRef.current();
        for (const plan of plans) {
          const source = await getNote(plan.sourceNoteId);
          const rewritten = base.map((element) => element.id === plan.elementId
            ? newElementWith(element, { customData: withCanvasNoteReference(element.customData, { noteId: plan.noteId, instanceId: plan.instanceId }) })
            : element) as OrderedExcalidrawElement[];
          const copy = rewritten.find((element) => element.id === plan.elementId);
          if (!copy) throw new Error("Could not duplicate this Note.");
          const created = await onCreateNote({
            clientRequestId: crypto.randomUUID(),
            clientNoteId: plan.noteId,
            clientInstanceId: plan.instanceId,
            elementId: copy.id,
            expectedCanvasVersion: version,
            document: source.document,
            canvas: { format: "excalidraw", version: 1, data: { elements: rewritten, appState: persistedAppState(state), files: {}, [DIAGRAM_DATA_KEY]: diagrams } },
            x: copy.x,
            y: copy.y,
            width: copy.width,
            height: copy.height,
          });
          version = created.canvas.version;
          latest = created.canvas.canvas;
          const saved = (created.canvas.canvas.data as { elements?: OrderedExcalidrawElement[] }).elements;
          base = Array.isArray(saved) ? saved : rewritten;
          remaining = remaining.slice(1);
        }
        if (latest) syncNoteCanvas(latest, base);
      } catch (error) {
        const failed = new Set(remaining.map((plan) => plan.elementId));
        const cleaned = base.map((element) => failed.has(element.id) ? newElementWith(element, { isDeleted: true }) : element) as OrderedExcalidrawElement[];
        syncNoteCanvas({ format: "excalidraw", version: 1, data: { elements: cleaned } }, cleaned);
        showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not duplicate this Note." });
      } finally {
        pendingNoteCopies.current = false;
      }
    })();
  }, [apiRef, canvasVersion, diagrams, onCreateNote, showToast, syncNoteCanvas]);

  const registerNoteFlush = useCallback((flush: () => Promise<void>) => {
    noteFlushRef.current = flush;
    return () => {
      if (noteFlushRef.current === flush) noteFlushRef.current = async () => {};
    };
  }, []);

  const flushNotes = useCallback(async () => {
    await noteFlushRef.current();
  }, []);

  useEffect(() => {
    const onNoteShortcut = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".notespace-canvas-surface")) return;
      if (
        target.closest("input, textarea, select, button, a, [contenteditable=\"true\"], [role=\"dialog\"], [role=\"toolbar\"], [role=\"menu\"], [role=\"listbox\"]")
        || canvasOverlayInteractionActive
        || viewModeEnabled
      ) return;
      const state = apiRef.current?.getAppState() as (AppState & { editingLinearElement?: unknown }) | undefined;
      if (state?.editingTextElement || state?.editingLinearElement || state?.openDialog) return;

      if (event.key === "Enter" && selectedElementCount === 1 && selectedElementId && !editingNoteElementId) {
        const selected = apiRef.current?.getSceneElementsIncludingDeleted().find(
          (element) => element.id === selectedElementId && !element.isDeleted,
        );
        if (readCanvasNoteReference(selected)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          startNoteEditing(selectedElementId, null);
          return;
        }
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void insertNote();
      }
    };
    window.addEventListener("keydown", onNoteShortcut, true);
    return () => window.removeEventListener("keydown", onNoteShortcut, true);
  }, [apiRef, canvasOverlayInteractionActive, editingNoteElementId, insertNote, selectedElementCount, selectedElementId, startNoteEditing, viewModeEnabled]);

  return {
    noteActivationPoint,
    startNoteEditing,
    finishNoteEditing,
    insertNote,
    placeLinkedNote,
    deleteSelectedNote,
    removeMissingNote,
    duplicateSelectedNote,
    toggleFoldNote,
    fitNoteContent,
    resizeNote,
    resolveNativeNoteCopies,
    registerNoteFlush,
    flushNotes,
  };
}
