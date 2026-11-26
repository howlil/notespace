import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { getNote, type CreateNoteInstanceRequest, type CreateNoteInstanceResult } from "../../../../platform/api/note-api";
import { DIAGRAM_DATA_KEY, type StructuredDiagram } from "../diagram/model/diagram";
import {
  emptyNoteDocument,
  notePlacement,
  readCanvasNoteReference,
  withCanvasNoteReference,
  withoutCanvasNoteReference,
  type CanvasNoteReference,
  type NoteCardColor,
  type NoteCardShape,
  type NoteDocument,
} from "../../../../entities/note";
import type { Snapshot } from "../../../../entities/workspace";
import type { ToastInput } from "../../../../shared/ui/feedback/toast-provider";
import { codeOverlayElements, persistedAppState, sceneSignature } from "../../core/canvas-scene-state";
import type { NoteActivationPoint } from "./CanvasNoteCardLayer";
import { clampNoteAutoHeight, NOTE_CARD_FOLDED_HEIGHT, NOTE_CARD_MIN_HEIGHT, noteHeightChanged } from "./model/note-card-layout";
import { pruneBoundElements, releaseArrowBindings } from "./model/note-connectors";

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
  onExpandNote?: (elementId: string) => void;
  onOpenNotePicker?: () => void;
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

function foldedTargetPatch(
  element: OrderedExcalidrawElement,
  reference: CanvasNoteReference,
  nextCompact: boolean,
): { height: number; reference: CanvasNoteReference } {
  if (nextCompact) {
    const expandedHeight = element.height > NOTE_CARD_FOLDED_HEIGHT
      ? element.height
      : (reference.expandedHeight ?? NOTE_CARD_MIN_HEIGHT);
    return {
      height: NOTE_CARD_FOLDED_HEIGHT,
      reference: { ...reference, compact: true, expandedHeight },
    };
  }
  const restoredHeight = reference.heightMode === "fixed"
    ? Math.max(80, reference.expandedHeight ?? NOTE_CARD_MIN_HEIGHT)
    : Math.max(NOTE_CARD_MIN_HEIGHT, reference.expandedHeight ?? NOTE_CARD_MIN_HEIGHT);
  const rest = { ...reference };
  delete rest.expandedHeight;
  return {
    height: restoredHeight,
    reference: { ...rest, compact: false },
  };
}

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
  onExpandNote,
  onOpenNotePicker,
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
  const pendingNoteDelete = useRef(false);
  const canvasVersionRef = useRef(canvasVersion);
  canvasVersionRef.current = canvasVersion;
  const onCreateNoteRef = useRef(onCreateNote);
  onCreateNoteRef.current = onCreateNote;
  const onDeleteNoteInstanceRef = useRef(onDeleteNoteInstance);
  onDeleteNoteInstanceRef.current = onDeleteNoteInstance;

  const startNoteEditing = useCallback((elementId: string, point: NoteActivationPoint | null = null) => {
    const value = apiRef.current;
    if (value) {
      const target = value.getSceneElementsIncludingDeleted().find((element) => element.id === elementId && !element.isDeleted);
      const reference = readCanvasNoteReference(target);
      if (target && reference?.compact) {
        const next = foldedTargetPatch(target, reference, false);
        expectedAutoFitHeightRef.current.set(elementId, next.height);
        const elements = value.getSceneElementsIncludingDeleted().map((element) => (
          element.id === elementId
            ? newElementWith(element, {
              height: next.height,
              customData: withCanvasNoteReference(element.customData, next.reference),
            })
            : element
        )) as OrderedExcalidrawElement[];
        value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
        setSceneElements(elements);
        setOverlayElements(codeOverlayElements(elements));
      }
    }
    setSelectedElementCount(1);
    setSelectedElementId(elementId);
    setNoteActivationPoint(point);
    setEditingNoteElementId(elementId);
  }, [apiRef, expectedAutoFitHeightRef, setEditingNoteElementId, setOverlayElements, setSceneElements, setSelectedElementCount, setSelectedElementId]);

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

  const restoreRemovedNotes = useCallback(async (removed: ReadonlyArray<{ element: OrderedExcalidrawElement; reference: CanvasNoteReference }>) => {
    const value = apiRef.current;
    const createNote = onCreateNoteRef.current;
    if (!value || !createNote || removed.length === 0) return;
    let base: readonly OrderedExcalidrawElement[] = value.getSceneElementsIncludingDeleted();
    let version = canvasVersionRef.current;
    let latestCanvas: Snapshot | null = null;
    let lastRestoredId: string | null = null;
    try {
      for (const { element: removedElement, reference } of removed) {
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
        if (!provisional) continue;
        const restoredElement = newElementWith(provisional, {
          customData: withCanvasNoteReference(provisional.customData, { ...reference, instanceId }),
        });
        const elements = [...base, restoredElement] as OrderedExcalidrawElement[];
        const state = value.getAppState();
        const data = { elements, appState: persistedAppState(state), files: {}, [DIAGRAM_DATA_KEY]: diagramsRef.current };
        const created = await createNote({
          clientRequestId: crypto.randomUUID(),
          clientNoteId: reference.noteId,
          clientInstanceId: instanceId,
          existingNoteId: reference.noteId,
          elementId: restoredElement.id,
          expectedCanvasVersion: version,
          canvas: { format: "excalidraw", version: 1, data },
          x: restoredElement.x,
          y: restoredElement.y,
          width: restoredElement.width,
          height: restoredElement.height,
          compact: reference.compact === true,
        });
        version = Math.max(version, created.canvas.version);
        canvasVersionRef.current = version;
        latestCanvas = created.canvas.canvas;
        const saved = (created.canvas.canvas.data as { elements?: OrderedExcalidrawElement[] }).elements;
        base = Array.isArray(saved) ? saved : elements;
        lastRestoredId = restoredElement.id;
      }
      if (latestCanvas) syncNoteCanvas(latestCanvas, base, lastRestoredId);
    } catch (error) {
      if (latestCanvas) syncNoteCanvas(latestCanvas, base, lastRestoredId);
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not restore this Note." });
    }
  }, [apiRef, diagramsRef, showToast, syncNoteCanvas]);

  const deleteSelectedNote = useCallback(() => {
    const value = apiRef.current;
    const deleteInstance = onDeleteNoteInstanceRef.current;
    if (!value || !deleteInstance || pendingNoteDelete.current) return false;
    const state = value.getAppState();
    const rawSelectedIds = Object.entries(state.selectedElementIds).filter(([, selected]) => selected).map(([id]) => id);
    const selectedIds = rawSelectedIds.length > 0
      ? rawSelectedIds
      : (selectedElementCount === 1 && selectedElementId ? [selectedElementId] : []);
    if (selectedIds.length === 0) return false;
    const selectedIdSet = new Set(selectedIds);
    const liveElements = value.getSceneElementsIncludingDeleted();
    const selectedElements = liveElements.filter((element) => selectedIdSet.has(element.id) && !element.isDeleted);
    const selectedNotes = selectedElements.flatMap((element) => {
      const reference = readCanvasNoteReference(element);
      return reference ? [{ element, reference }] : [];
    });
    if (selectedNotes.length === 0) return false;

    const nonNoteIds = new Set(
      selectedElements
        .filter((element) => !readCanvasNoteReference(element))
        .map((element) => element.id),
    );
    const applyRemovals = (
      elements: readonly OrderedExcalidrawElement[],
      idsToRemove: ReadonlySet<string>,
    ): OrderedExcalidrawElement[] => {
      let next = elements.map((element) => (
        idsToRemove.has(element.id) ? newElementWith(element, { isDeleted: true, boundElements: null }) : element
      )) as OrderedExcalidrawElement[];
      for (const removedId of idsToRemove) {
        next = releaseArrowBindings(
          next,
          removedId,
          (element, patch) => ("startBinding" in element ? newElementWith(element, patch) : element),
        ) as OrderedExcalidrawElement[];
      }
      return pruneBoundElements(
        next,
        idsToRemove,
        (element, patch) => newElementWith(element, patch),
      ) as OrderedExcalidrawElement[];
    };

    pendingNoteDelete.current = true;
    const removedPairs = selectedNotes.map(({ element, reference }) => ({
      element: newElementWith(element, { isDeleted: true, boundElements: null }),
      reference,
    }));
    void (async () => {
      let currentElements = liveElements;
      let version = canvasVersionRef.current;
      let latestCanvas: Snapshot | null = null;
      try {
        for (let index = 0; index < selectedNotes.length; index += 1) {
          const item = selectedNotes[index]!;
          const batchIds = new Set<string>([item.element.id]);
          if (index === selectedNotes.length - 1) {
            for (const otherId of nonNoteIds) batchIds.add(otherId);
          }
          const nextElements = applyRemovals(currentElements, batchIds);
          const data = { elements: nextElements, appState: persistedAppState(state), files: {}, [DIAGRAM_DATA_KEY]: diagramsRef.current };
          const result = await deleteInstance(
            workspaceId,
            item.reference.instanceId,
            { format: "excalidraw", version: 1, data },
            version,
          );
          version = Math.max(version, result.version);
          canvasVersionRef.current = version;
          latestCanvas = result.canvas;
          const saved = (result.canvas.data as { elements?: OrderedExcalidrawElement[] }).elements;
          currentElements = Array.isArray(saved) ? saved : nextElements;
        }
        if (latestCanvas) {
          syncNoteCanvas(latestCanvas, currentElements, null);
          finishNoteEditing(null);
          showToast({
            kind: "info",
            message: selectedNotes.length === 1
              ? "Note removed from Canvas. The Note itself remains."
              : `${selectedNotes.length} Notes removed from Canvas. The Notes themselves remain.`,
            action: {
              label: "Undo",
              onClick: () => {
                void restoreRemovedNotes(removedPairs);
              },
            },
          });
        }
      } catch (error) {
        if (latestCanvas) syncNoteCanvas(latestCanvas, currentElements, null);
        showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not remove this Note." });
      } finally {
        pendingNoteDelete.current = false;
      }
    })();
    return true;
  }, [apiRef, diagramsRef, finishNoteEditing, restoreRemovedNotes, selectedElementCount, selectedElementId, showToast, syncNoteCanvas, workspaceId]);

  const removeMissingNote = useCallback((elementId: string) => {
    const value = apiRef.current;
    if (!value) return;
    const elements = releaseArrowBindings(
      value.getSceneElementsIncludingDeleted().map((element) => (
        element.id === elementId ? newElementWith(element, { isDeleted: true, boundElements: null }) : element
      )),
      elementId,
      (element, patch) => ("startBinding" in element ? newElementWith(element, patch) : element),
    ) as OrderedExcalidrawElement[];
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
        ...(reference.compact ? { compact: true } : {}),
        ...(reference.expandedHeight ? { expandedHeight: reference.expandedHeight } : {}),
        ...(reference.color ? { color: reference.color } : {}),
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
        compact: reference.compact === true,
      });
    }).then((result) => {
      canvasVersionRef.current = Math.max(canvasVersionRef.current, result.canvas.version);
      syncNoteCanvas(result.canvas.canvas, elements, duplicateWithReference.id);
    }).catch((error: unknown) => showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not duplicate this Note." }));
    return true;
  }, [apiRef, diagrams, onCreateNote, selectedElementCount, selectedElementId, showToast, syncNoteCanvas]);

  const spawnConnectedNote = useCallback(async (source: OrderedExcalidrawElement, target: OrderedExcalidrawElement) => {
    const value = apiRef.current;
    const createNote = onCreateNoteRef.current;
    if (!value || !createNote || !readCanvasNoteReference(source)) return;
    const noteId = crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    // The native connector already created the shape and its bound arrow; the shape becomes a blank Note.
    const noteElement = newElementWith(target, {
      strokeColor: source.strokeColor,
      backgroundColor: source.backgroundColor,
      fillStyle: "solid",
      strokeWidth: source.strokeWidth,
      roughness: 0,
      roundness: source.roundness,
      opacity: source.opacity,
      customData: withCanvasNoteReference(withoutCanvasNoteReference(target.customData), { noteId, instanceId }),
    });
    const elements = value.getSceneElementsIncludingDeleted()
      .map((element) => (element.id === target.id ? noteElement : element)) as OrderedExcalidrawElement[];
    const data = { elements, appState: persistedAppState(value.getAppState()), files: {}, [DIAGRAM_DATA_KEY]: diagramsRef.current };
    try {
      const created = await createNote({
        clientRequestId: crypto.randomUUID(),
        clientNoteId: noteId,
        clientInstanceId: instanceId,
        elementId: noteElement.id,
        expectedCanvasVersion: canvasVersionRef.current,
        document: emptyNoteDocument(),
        canvas: { format: "excalidraw", version: 1, data },
        x: noteElement.x,
        y: noteElement.y,
        width: noteElement.width,
        height: noteElement.height,
      });
      canvasVersionRef.current = Math.max(canvasVersionRef.current, created.canvas.version);
      syncNoteCanvas(created.canvas.canvas, elements, noteElement.id);
      startNoteEditing(noteElement.id, null);
    } catch (error) {
      // Failed create+place leaves neither an orphan Note nor a dangling shape or connector (X3).
      const removedIds = new Set<string>();
      const markedDeleted = value.getSceneElementsIncludingDeleted().map((element) => {
        const bound = element.id === target.id
          || ("startBinding" in element && element.startBinding?.elementId === target.id)
          || ("endBinding" in element && element.endBinding?.elementId === target.id);
        if (!bound) return element;
        removedIds.add(element.id);
        return newElementWith(element, { isDeleted: true, boundElements: null });
      }) as OrderedExcalidrawElement[];
      const cleaned = pruneBoundElements(
        markedDeleted,
        removedIds,
        (element, patch) => newElementWith(element, patch),
      ) as OrderedExcalidrawElement[];
      syncNoteCanvas({ format: "excalidraw", version: 1, data: { elements: cleaned } }, cleaned, source.id);
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not create the connected Note." });
    }
  }, [apiRef, diagramsRef, showToast, startNoteEditing, syncNoteCanvas]);

  const insertNote = useCallback(async (
    linkedNoteId?: string,
    options?: { position?: { x: number; y: number }; document?: NoteDocument; autoEdit?: boolean },
  ) => {
    const value = apiRef.current;
    if (!value || !onCreateNote) return;
    const state = value.getAppState();
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const width = 320;
    const height = NOTE_CARD_MIN_HEIGHT;
    const placement = options?.position
      ? { x: options.position.x - width / 2, y: options.position.y - 36 }
      : notePlacement({
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
        ...(linkedNoteId ? { existingNoteId: linkedNoteId } : { document: options?.document ?? emptyNoteDocument() }),
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
      const shouldEdit = options?.autoEdit ?? !linkedNoteId;
      if (shouldEdit) startNoteEditing(noteElement.id, null);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not create this Note." });
    }
  }, [apiRef, dark, diagrams, diagramsRef, lastExternalSceneRef, lastRef, onCreateNote, setHasElements, setOverlayElements, setSceneElements, setSelectedElementCount, setSelectedElementId, showToast, startNoteEditing, surfaceRef]);

  const insertNoteAt = useCallback(async (sceneX: number, sceneY: number) => {
    await insertNote(undefined, { position: { x: sceneX, y: sceneY } });
  }, [insertNote]);

  const placeLinkedNote = useCallback(async (noteId: string) => {
    await insertNote(noteId);
  }, [insertNote]);

  const applyNoteHeight = useCallback((elementId: string, height: number, forceAuto: boolean) => {
    const value = apiRef.current;
    if (!value || !Number.isFinite(height)) return;
    const current = value.getSceneElementsIncludingDeleted().find((element) => element.id === elementId && !element.isDeleted);
    const reference = readCanvasNoteReference(current);
    if (!current || !reference || reference.compact) return;
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
    const nextCompact = reference.compact !== true;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== elementId || element.isDeleted) return element;
      const next = foldedTargetPatch(element, reference, nextCompact);
      expectedAutoFitHeightRef.current.set(elementId, next.height);
      return newElementWith(element, {
        height: next.height,
        customData: withCanvasNoteReference(element.customData, next.reference),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSceneElements(elements);
    setOverlayElements(codeOverlayElements(elements));
  }, [apiRef, editingNoteElementId, expectedAutoFitHeightRef, finishNoteEditing, setOverlayElements, setSceneElements]);

  const toggleFoldSelectedNotes = useCallback(() => {
    const value = apiRef.current;
    if (!value) return false;
    const selectedIds = Object.entries(value.getAppState().selectedElementIds).filter(([, selected]) => selected).map(([id]) => id);
    const targetIds = selectedIds.length > 0 ? selectedIds : (selectedElementCount === 1 && selectedElementId ? [selectedElementId] : []);
    if (targetIds.length === 0) return false;
    const targetIdSet = new Set(targetIds);
    const allElements = value.getSceneElementsIncludingDeleted();
    const selectedNotes = allElements.flatMap((element) => {
      if (!targetIdSet.has(element.id) || element.isDeleted) return [];
      const reference = readCanvasNoteReference(element);
      return reference ? [{ element, reference }] : [];
    });
    if (selectedNotes.length === 0) return false;
    const nextCompact = selectedNotes.some(({ reference }) => reference.compact !== true);
    if (editingNoteElementId && targetIdSet.has(editingNoteElementId)) finishNoteEditing(null);
    const elements = allElements.map((element) => {
      if (!targetIdSet.has(element.id) || element.isDeleted) return element;
      const reference = readCanvasNoteReference(element);
      if (!reference) return element;
      const next = foldedTargetPatch(element, reference, nextCompact);
      expectedAutoFitHeightRef.current.set(element.id, next.height);
      return newElementWith(element, {
        height: next.height,
        customData: withCanvasNoteReference(element.customData, next.reference),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSceneElements(elements);
    setOverlayElements(codeOverlayElements(elements));
    return true;
  }, [apiRef, editingNoteElementId, expectedAutoFitHeightRef, finishNoteEditing, selectedElementCount, selectedElementId, setOverlayElements, setSceneElements]);

  const setNoteColor = useCallback((elementId: string, color: NoteCardColor) => {
    const value = apiRef.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== elementId || element.isDeleted) return element;
      const reference = readCanvasNoteReference(element);
      if (!reference) return element;
      const rest = { ...reference };
      delete rest.color;
      const nextReference: CanvasNoteReference = color === "default" ? rest : { ...rest, color };
      return newElementWith(element, {
        customData: withCanvasNoteReference(element.customData, nextReference),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSceneElements(elements);
  }, [apiRef, setSceneElements]);

  const setNoteShape = useCallback((elementId: string, shape: NoteCardShape) => {
    const value = apiRef.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== elementId || element.isDeleted) return element;
      const reference = readCanvasNoteReference(element);
      if (!reference) return element;
      const rest = { ...reference };
      delete rest.shape;
      // Rounded is the default, so it is stored as the absence of a shape.
      const nextReference: CanvasNoteReference = shape === "rounded" ? rest : { ...rest, shape };
      return newElementWith(element, {
        customData: withCanvasNoteReference(element.customData, nextReference),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setSceneElements(elements);
  }, [apiRef, setSceneElements]);

  const resolveNativeNoteCopies = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, copyIds: string[]) => {
    const value = apiRef.current;
    if (!value || !onCreateNote || pendingNoteCopies.current) return;
    const plans = copyIds.flatMap((elementId) => {
      const reference = readCanvasNoteReference(elements.find((element) => element.id === elementId));
      return reference ? [{ elementId, sourceNoteId: reference.noteId, reference, noteId: crypto.randomUUID(), instanceId: crypto.randomUUID() }] : [];
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
            ? newElementWith(element, {
              customData: withCanvasNoteReference(element.customData, {
                ...plan.reference,
                noteId: plan.noteId,
                instanceId: plan.instanceId,
              }),
            })
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
            compact: plan.reference.compact === true,
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
    const surface = surfaceRef.current;
    if (!surface) return;
    const handleNoteWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.deltaY === 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".notespace-note-ui, [role='dialog'], [role='menu'], [role='listbox'], [data-canvas-code-block], [data-note-editing='true']")) return;
      const cards = surface.querySelectorAll<HTMLElement>("[data-note-element]");
      for (let index = cards.length - 1; index >= 0; index -= 1) {
        const card = cards[index];
        if (!card) continue;
        const rect = card.getBoundingClientRect();
        if (
          event.clientX < rect.left
          || event.clientX > rect.right
          || event.clientY < rect.top
          || event.clientY > rect.bottom
        ) {
          continue;
        }
        const scroller = card.querySelector<HTMLElement>("[data-note-scroll]");
        if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
          scroller.scrollTop += event.deltaY;
          event.preventDefault();
          event.stopPropagation();
        }
        break;
      }
    };
    surface.addEventListener("wheel", handleNoteWheel, { capture: true, passive: false });
    return () => surface.removeEventListener("wheel", handleNoteWheel, true);
  }, [surfaceRef]);

  useEffect(() => {
    const onNoteShortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".notespace-canvas-surface")) return;
      if (
        target.closest("input, textarea, select, button, a, [contenteditable=\"true\"], [role=\"dialog\"], [role=\"toolbar\"], [role=\"menu\"], [role=\"listbox\"]")
        || canvasOverlayInteractionActive
        || viewModeEnabled
      ) return;
      const state = apiRef.current?.getAppState() as (AppState & { editingLinearElement?: unknown }) | undefined;
      if (state?.editingTextElement || state?.editingLinearElement || state?.openDialog) return;

      // Ctrl/Cmd + Alt + Enter: fold/unfold selected Note card(s)
      if ((event.ctrlKey || event.metaKey) && event.altKey && !event.shiftKey && event.key === "Enter") {
        if (toggleFoldSelectedNotes()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }

      // Shift + Enter: expand/focus selected Note in NoteFocusModal
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Enter") {
        if (selectedElementCount === 1 && selectedElementId && !editingNoteElementId) {
          const selected = apiRef.current?.getSceneElementsIncludingDeleted().find(
            (element) => element.id === selectedElementId && !element.isDeleted,
          );
          if (readCanvasNoteReference(selected)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            onExpandNote?.(selectedElementId);
          }
        }
        return;
      }

      // Shift + N: open existing/unplaced Note picker
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "n") {
        if (onOpenNotePicker) {
          event.preventDefault();
          event.stopImmediatePropagation();
          onOpenNotePicker();
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      // Delete / Backspace: remove selected Note instance(s) cleanly with Undo toast
      if ((event.key === "Delete" || event.key === "Backspace") && !editingNoteElementId) {
        if (deleteSelectedNote()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }

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
  }, [
    apiRef,
    canvasOverlayInteractionActive,
    deleteSelectedNote,
    editingNoteElementId,
    insertNote,
    onExpandNote,
    onOpenNotePicker,
    selectedElementCount,
    selectedElementId,
    startNoteEditing,
    toggleFoldSelectedNotes,
    viewModeEnabled,
  ]);

  return {
    noteActivationPoint,
    startNoteEditing,
    finishNoteEditing,
    insertNote,
    insertNoteAt,
    spawnConnectedNote,
    placeLinkedNote,
    deleteSelectedNote,
    removeMissingNote,
    duplicateSelectedNote,
    toggleFoldNote,
    toggleFoldSelectedNotes,
    setNoteColor,
    setNoteShape,
    fitNoteContent,
    resizeNote,
    resolveNativeNoteCopies,
    registerNoteFlush,
    flushNotes,
  };
}
