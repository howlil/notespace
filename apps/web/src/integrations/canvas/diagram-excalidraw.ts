import { FONT_FAMILY, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/excalidraw/math/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import {
  diagramNodeLabelElementId,
  getCatalogItem,
  structuredElementIds,
  type StructuredDiagram,
} from "../../features/diagram/diagram-model";
import { diagramGroupBounds, routeStructuredDiagram } from "../../features/diagram/diagram-routing";
import {
  eraserIconFileId,
  eraserIconName,
  eraserNodeIconElementId,
  eraserNodeRenderGroupId,
} from "../../features/diagram/eraser-icons";

function fallbackNodeText(specKey: string, label: string) {
  const glyph = getCatalogItem(specKey).glyph;
  return `${glyph}\n${label}`;
}

const diagramFontFamily = FONT_FAMILY.Helvetica;

export function renderStructuredDiagram(
  diagram: StructuredDiagram,
  dark: boolean,
  availableEraserIcons: ReadonlySet<string> = new Set(),
): OrderedExcalidrawElement[] {
  const strokeColor = dark ? "#7fa6c9" : "#4f7396";
  const backgroundColor = dark ? "#1b2636" : "#f0f4f8";
  const groupStroke = dark ? "#586678" : "#aab7c4";
  const skeletons: ExcalidrawElementSkeleton[] = [];

  for (const group of diagram.groups) {
    const bounds = diagramGroupBounds(diagram, group.nodeIds);
    if (!bounds) continue;
    skeletons.push({
      type: "rectangle",
      id: group.elementId,
      ...bounds,
      strokeColor: groupStroke,
      backgroundColor: "transparent",
      strokeStyle: "dashed",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      label: { text: group.label, fontSize: 12, fontFamily: diagramFontFamily },
    });
  }

  for (const node of diagram.nodes) {
    const item = getCatalogItem(node.specKey);
    const iconName = eraserIconName(node.specKey);
    const hasEraserIcon = Boolean(iconName && availableEraserIcons.has(iconName));
    const renderGroupId = eraserNodeRenderGroupId(node.id);

    if (node.renderMode === "icon") {
      if (hasEraserIcon && iconName) {
        skeletons.push({
          type: "image",
          id: node.elementId,
          fileId: eraserIconFileId(iconName) as BinaryFileData["id"],
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          groupIds: [renderGroupId],
        });
        skeletons.push({
          type: "text",
          id: diagramNodeLabelElementId(node.elementId),
          x: node.x - 16,
          y: node.y + node.height + 8,
          width: node.width + 32,
          text: node.label,
          fontSize: 12,
          fontFamily: diagramFontFamily,
          textAlign: "center",
          strokeColor,
          groupIds: [renderGroupId],
        });
      } else {
        skeletons.push({
          type: "rectangle",
          id: node.elementId,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          strokeColor,
          backgroundColor,
          fillStyle: "solid",
          strokeWidth: 1,
          roughness: 0,
          roundness: { type: 3 },
          groupIds: [renderGroupId],
          label: { text: fallbackNodeText(node.specKey, node.label), fontSize: 12, fontFamily: diagramFontFamily },
        });
      }
      continue;
    }

    skeletons.push({
      type: item.shape ?? "rectangle",
      id: node.elementId,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      strokeColor,
      backgroundColor,
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: item.shape === "rectangle" || !item.shape ? { type: 3 } : undefined,
      groupIds: hasEraserIcon ? [renderGroupId] : undefined,
      label: {
        text: hasEraserIcon ? node.label : fallbackNodeText(node.specKey, node.label),
        fontSize: 14,
        fontFamily: diagramFontFamily,
      },
    });

    if (hasEraserIcon && iconName) {
      const size = Math.min(26, Math.max(18, node.height - 28));
      skeletons.push({
        type: "image",
        id: eraserNodeIconElementId(node.elementId),
        fileId: eraserIconFileId(iconName) as BinaryFileData["id"],
        x: node.x + 14,
        y: node.y + (node.height - size) / 2,
        width: size,
        height: size,
        groupIds: [renderGroupId],
      });
    }
  }

  const routes = routeStructuredDiagram(diagram);
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  for (const edge of diagram.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const route = routes.get(edge.id);
    skeletons.push({
      type: "arrow",
      id: edge.elementId,
      x: route?.x ?? 0,
      y: route?.y ?? 0,
      ...(route ? { points: route.points as LocalPoint[] } : {}),
      strokeColor,
      strokeWidth: 1,
      roughness: 0,
      roundness: route ? { type: 2 } : undefined,
      endArrowhead: "arrow",
      start: { id: from.elementId },
      end: { id: to.elementId },
      ...(edge.label ? { label: { text: edge.label, fontSize: 11, fontFamily: diagramFontFamily } } : {}),
    });
  }

  return convertToExcalidrawElements(skeletons) as OrderedExcalidrawElement[];
}

function containerIdOf(element: OrderedExcalidrawElement) {
  return "containerId" in element && typeof element.containerId === "string" ? element.containerId : null;
}

export function replaceStructuredDiagramElements(
  scene: readonly OrderedExcalidrawElement[],
  previous: StructuredDiagram | null,
  next: StructuredDiagram,
  dark: boolean,
  availableEraserIcons: ReadonlySet<string> = new Set(),
) {
  const ids = previous ? structuredElementIds(previous) : new Set<string>();
  const iconIds = new Set(previous?.nodes.map((node) => eraserNodeIconElementId(node.elementId)) ?? []);
  const retained = scene.filter((element) => !ids.has(element.id) && !iconIds.has(element.id) && !ids.has(containerIdOf(element) ?? ""));
  return [...retained, ...renderStructuredDiagram(next, dark, availableEraserIcons)] as OrderedExcalidrawElement[];
}
