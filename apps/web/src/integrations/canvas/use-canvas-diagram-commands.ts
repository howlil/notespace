import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useMemo } from "react";
import {
  addCatalogNode,
  connectDiagramNodes,
  createDiagramWithNode,
  emptyDiagramSelection,
  groupDiagramNodes,
  hydrateDiagramGeometryFromElements,
  layoutDiagram,
  removeDiagramEdge,
  renameDiagramEdge,
  renameDiagramGroup,
  renameDiagramNode,
  ungroupDiagramNodes,
  type DiagramCatalogItem,
  type DiagramSelection,
  type StructuredDiagram,
} from "../../features/diagram/diagram-model";
import { forgetDiagramHistory } from "./canvas-state";
import { spawnConnectedStructuredNode, type DirectionalSpawnDirection } from "./CanvasDirectionalSpawn";
import { replaceStructuredDiagramElements } from "./diagram-excalidraw";
import { ensureEraserDiagramIconFiles } from "./eraser-icon-files";

type DiagramCommandsOptions = {
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  workspaceId: string;
  dark: boolean;
  diagrams: StructuredDiagram[];
  diagramsRef: MutableRefObject<StructuredDiagram[]>;
  diagramHistoryRef: MutableRefObject<StructuredDiagram[]>;
  diagramSelection: DiagramSelection;
  lastDiagramId: string | null;
  setLastDiagramId: Dispatch<SetStateAction<string | null>>;
  updateDiagramState: (next: StructuredDiagram[]) => void;
  updateDiagramSelection: (next: DiagramSelection) => void;
  emitSnapshot: (
    elements: readonly OrderedExcalidrawElement[],
    state: AppState,
    diagrams: readonly StructuredDiagram[],
  ) => void;
  canvasOrigin: () => { x: number; y: number };
  canvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number };
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function useCanvasDiagramCommands({
  apiRef,
  workspaceId,
  dark,
  diagrams,
  diagramsRef,
  diagramHistoryRef,
  diagramSelection,
  lastDiagramId,
  setLastDiagramId,
  updateDiagramState,
  updateDiagramSelection,
  emitSnapshot,
  canvasOrigin,
  canvasPointFromClient,
  onError,
  onSuccess,
}: DiagramCommandsOptions) {
  const activeDiagram = useMemo(() => {
    const id = diagramSelection.diagramId ?? lastDiagramId ?? diagrams.at(-1)?.id ?? null;
    return id ? diagrams.find((diagram) => diagram.id === id) ?? null : null;
  }, [diagramSelection.diagramId, diagrams, lastDiagramId]);

  const selectedNodeLabel = useMemo(() => {
    if (!activeDiagram || diagramSelection.nodeIds.length !== 1) return null;
    return activeDiagram.nodes.find((node) => node.id === diagramSelection.nodeIds[0])?.label ?? null;
  }, [activeDiagram, diagramSelection.nodeIds]);

  const selectedEdgeLabel = useMemo(() => {
    if (!activeDiagram || !diagramSelection.edgeId) return null;
    return activeDiagram.edges.find((edge) => edge.id === diagramSelection.edgeId)?.label ?? null;
  }, [activeDiagram, diagramSelection.edgeId]);

  const selectedGroupLabel = useMemo(() => {
    if (!activeDiagram || !diagramSelection.groupId) return null;
    return activeDiagram.groups.find((group) => group.id === diagramSelection.groupId)?.label ?? null;
  }, [activeDiagram, diagramSelection.groupId]);

  const withLiveGeometry = useCallback((diagram: StructuredDiagram) => {
    const value = apiRef.current;
    return value
      ? hydrateDiagramGeometryFromElements(diagram, value.getSceneElements())
      : diagram;
  }, [apiRef]);

  const applyDiagram = useCallback(async (
    previous: StructuredDiagram | null,
    next: StructuredDiagram,
    options: { selectNodeId?: string; geometry?: "scene" | "command" } = {},
  ) => {
    const value = apiRef.current;
    if (!value) return;
    await document.fonts.ready;
    const scene = value.getSceneElements();
    const renderDiagram = options.geometry === "command"
      ? next
      : hydrateDiagramGeometryFromElements(next, scene);
    const iconLoad = await ensureEraserDiagramIconFiles(value, renderDiagram, workspaceId);
    if (iconLoad.failed.length) {
      onError("Some Eraser icons could not load. Text fallback was kept for those nodes.");
    }
    const nextElements = replaceStructuredDiagramElements(
      scene,
      previous,
      renderDiagram,
      dark,
      iconLoad.available,
    );
    const nextDiagrams = previous
      ? diagramsRef.current.map((diagram) => diagram.id === previous.id ? next : diagram)
      : [...diagramsRef.current, next];
    const selectedNode = options.selectNodeId
      ? next.nodes.find((node) => node.id === options.selectNodeId) ?? null
      : null;
    const selectedElementIds = selectedNode ? { [selectedNode.elementId]: true as const } : {};

    updateDiagramState(nextDiagrams);
    setLastDiagramId(next.id);
    updateDiagramSelection({
      diagramId: next.id,
      nodeIds: selectedNode ? [selectedNode.id] : [],
      edgeId: null,
      groupId: null,
    });
    value.updateScene({
      elements: nextElements,
      appState: { selectedElementIds },
      captureUpdate: "IMMEDIATELY" as never,
    });
    emitSnapshot(nextElements, value.getAppState(), nextDiagrams);
  }, [
    apiRef,
    dark,
    diagramsRef,
    emitSnapshot,
    onError,
    setLastDiagramId,
    updateDiagramSelection,
    updateDiagramState,
    workspaceId,
  ]);

  const insertNode = useCallback((item: DiagramCatalogItem, drop?: { clientX: number; clientY: number }) => {
    const droppedOrigin = drop ? canvasPointFromClient(drop.clientX, drop.clientY) : null;
    const previousDiagram = activeDiagram;
    if (!previousDiagram) {
      void applyDiagram(
        null,
        createDiagramWithNode("architecture", item, droppedOrigin ?? canvasOrigin(), undefined, "icon"),
      );
      return;
    }
    const currentDiagram = withLiveGeometry(previousDiagram);
    const tail = currentDiagram.nodes.at(-1);
    const origin = droppedOrigin ?? (tail ? { x: tail.x + 96, y: tail.y } : canvasOrigin());
    void applyDiagram(
      previousDiagram,
      addCatalogNode(currentDiagram, item, origin, undefined, "icon"),
    );
  }, [activeDiagram, applyDiagram, canvasOrigin, canvasPointFromClient, withLiveGeometry]);

  const connectSelected = useCallback(() => {
    if (!activeDiagram || diagramSelection.nodeIds.length !== 2) return;
    void applyDiagram(
      activeDiagram,
      connectDiagramNodes(activeDiagram, diagramSelection.nodeIds[0], diagramSelection.nodeIds[1]),
    );
  }, [activeDiagram, applyDiagram, diagramSelection.nodeIds]);

  const groupSelected = useCallback(() => {
    if (!activeDiagram || diagramSelection.nodeIds.length < 2) return;
    void applyDiagram(activeDiagram, groupDiagramNodes(activeDiagram, diagramSelection.nodeIds));
  }, [activeDiagram, applyDiagram, diagramSelection.nodeIds]);

  const renameSelectedNode = useCallback((label: string) => {
    if (!activeDiagram || diagramSelection.nodeIds.length !== 1) return;
    void applyDiagram(
      activeDiagram,
      renameDiagramNode(activeDiagram, diagramSelection.nodeIds[0], label),
    );
  }, [activeDiagram, applyDiagram, diagramSelection.nodeIds]);

  const renameSelectedEdge = useCallback((label: string) => {
    if (!activeDiagram || !diagramSelection.edgeId) return;
    void applyDiagram(
      activeDiagram,
      renameDiagramEdge(activeDiagram, diagramSelection.edgeId, label),
    );
  }, [activeDiagram, applyDiagram, diagramSelection.edgeId]);

  const deleteSelectedEdge = useCallback(() => {
    if (!activeDiagram || !diagramSelection.edgeId) return;
    void applyDiagram(activeDiagram, removeDiagramEdge(activeDiagram, diagramSelection.edgeId));
  }, [activeDiagram, applyDiagram, diagramSelection.edgeId]);

  const renameSelectedGroup = useCallback((label: string) => {
    if (!activeDiagram || !diagramSelection.groupId) return;
    void applyDiagram(
      activeDiagram,
      renameDiagramGroup(activeDiagram, diagramSelection.groupId, label),
    );
  }, [activeDiagram, applyDiagram, diagramSelection.groupId]);

  const ungroupSelected = useCallback(() => {
    if (!activeDiagram || !diagramSelection.groupId) return;
    void applyDiagram(activeDiagram, ungroupDiagramNodes(activeDiagram, diagramSelection.groupId));
  }, [activeDiagram, applyDiagram, diagramSelection.groupId]);

  const autoLayout = useCallback(() => {
    if (!activeDiagram) return;
    const currentDiagram = withLiveGeometry(activeDiagram);
    void applyDiagram(activeDiagram, layoutDiagram(currentDiagram), { geometry: "command" });
  }, [activeDiagram, applyDiagram, withLiveGeometry]);

  const detachDiagram = useCallback(() => {
    const value = apiRef.current;
    if (!activeDiagram || !value) return;
    const nextDiagrams = diagramsRef.current.filter((diagram) => diagram.id !== activeDiagram.id);
    diagramHistoryRef.current = forgetDiagramHistory(
      diagramHistoryRef.current,
      activeDiagram.id,
    );
    updateDiagramState(nextDiagrams);
    updateDiagramSelection(emptyDiagramSelection());
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    emitSnapshot(value.getSceneElements(), value.getAppState(), nextDiagrams);
    onSuccess("Diagram detached. Its Excalidraw shapes remain fully editable.");
  }, [
    activeDiagram,
    apiRef,
    diagramHistoryRef,
    diagramsRef,
    emitSnapshot,
    onSuccess,
    setLastDiagramId,
    updateDiagramSelection,
    updateDiagramState,
  ]);

  const spawnSelected = useCallback((direction: DirectionalSpawnDirection) => {
    if (!activeDiagram || diagramSelection.nodeIds.length !== 1) return false;
    const currentDiagram = withLiveGeometry(activeDiagram);
    const result = spawnConnectedStructuredNode(
      currentDiagram,
      diagramSelection.nodeIds[0],
      direction,
    );
    if (!result) return false;
    void applyDiagram(activeDiagram, result.diagram, { selectNodeId: result.nodeId });
    return true;
  }, [activeDiagram, applyDiagram, diagramSelection.nodeIds, withLiveGeometry]);

  return {
    activeDiagram,
    selectedNodeLabel,
    selectedEdgeLabel,
    selectedGroupLabel,
    insertNode,
    connectSelected,
    groupSelected,
    renameSelectedNode,
    renameSelectedEdge,
    deleteSelectedEdge,
    renameSelectedGroup,
    ungroupSelected,
    autoLayout,
    detachDiagram,
    spawnSelected,
  };
}
