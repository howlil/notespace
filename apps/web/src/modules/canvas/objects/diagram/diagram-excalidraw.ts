import { FONT_FAMILY, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/excalidraw/math/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import {
  diagramNodeFrameElementId,
  diagramNodeLabelElementId,
  getCatalogItem,
  structuredElementIds,
  type StructuredDiagram,
} from "./model/diagram";
import { diagramGroupBounds, routeStructuredDiagram } from "./model/routing";
import {
  eraserIconFileId,
  eraserIconName,
  eraserNodeIconElementId,
  eraserNodeRenderGroupId,
} from "./palette/eraser-icons";

function fallbackNodeText(specKey: string, label: string) {
  const glyph = getCatalogItem(specKey).glyph;
  return `${glyph}\n${label}`;
}

const diagramFontFamily = FONT_FAMILY.Helvetica;
const ICON_LABEL_LINE_CHARS = 14;
const ICON_FRAME_PADDING = 4;

/** Word-wraps an icon label to at most two lines; overflow is ellipsized. */
export function wrapIconLabel(label: string, maxChars = ICON_LABEL_LINE_CHARS) {
  const lines: string[] = [];
  for (const word of label.trim().split(/\s+/)) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= maxChars) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  if (lines.length <= 2) return lines.join("\n");
  const second = lines.slice(1).join(" ");
  return `${lines[0]}\n${second.slice(0, maxChars - 1).trimEnd()}…`;
}

function readThemeToken(token: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}

function renderStructuredDiagram(
  diagram: StructuredDiagram,
  dark: boolean,
  availableEraserIcons: ReadonlySet<string> = new Set(),
): OrderedExcalidrawElement[] {
  const strokeColor = readThemeToken("--accent", dark ? "#8caaf9" : "#3252b6");
  const labelColor = readThemeToken("--ink", "#1c1c1e");
  const backgroundColor = readThemeToken("--tint", dark ? "#252f49" : "#e9eef9");
  const groupStroke = readThemeToken("--muted", dark ? "#a19a8e" : "#60594f");
  const skeletons: ExcalidrawElementSkeleton[] = [];
  const availableIcon = (specKey: string) => {
    const name = eraserIconName(specKey);
    return name && availableEraserIcons.has(name) ? name : null;
  };

  // Pass 1: Excalidraw measures icon labels so each icon node gets a frame around icon + label.
  const iconLabels = convertToExcalidrawElements(
    diagram.nodes
      .filter((node) => node.renderMode === "icon" && availableIcon(node.specKey))
      .map((node): ExcalidrawElementSkeleton => ({
        type: "text",
        id: diagramNodeLabelElementId(node.elementId),
        // For center-aligned text Excalidraw subtracts width/2 from `x`, so `x` is the label's centre.
        x: node.x + node.width / 2,
        y: node.y + node.height + 6,
        text: wrapIconLabel(node.label),
        fontSize: 12,
        fontFamily: diagramFontFamily,
        textAlign: "center",
        strokeColor: labelColor,
        groupIds: [eraserNodeRenderGroupId(node.id)],
      })),
    { regenerateIds: false },
  ) as OrderedExcalidrawElement[];
  const labelsById = new Map(iconLabels.map((label) => [label.id, label]));
  const frames = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const node of diagram.nodes) {
    const label = labelsById.get(diagramNodeLabelElementId(node.elementId));
    if (!label) continue;
    const left = Math.min(node.x, label.x) - ICON_FRAME_PADDING;
    const right = Math.max(node.x + node.width, label.x + label.width) + ICON_FRAME_PADDING;
    const top = node.y - ICON_FRAME_PADDING;
    const bottom = label.y + label.height + ICON_FRAME_PADDING;
    frames.set(node.id, { x: left, y: top, width: right - left, height: bottom - top });
  }
  // Routing and boundaries treat an icon node as its whole frame (icon + label).
  const entityDiagram: StructuredDiagram = {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      const frame = frames.get(node.id);
      return frame ? { ...node, ...frame, renderMode: undefined } : node;
    }),
  };
  const bindTargetId = (node: StructuredDiagram["nodes"][number]) =>
    frames.has(node.id) ? diagramNodeFrameElementId(node.elementId) : node.elementId;

  for (const group of diagram.groups) {
    const bounds = diagramGroupBounds(entityDiagram, group.nodeIds);
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
    const hasEraserIcon = Boolean(availableIcon(node.specKey));
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
        const frame = frames.get(node.id);
        if (frame) {
          skeletons.push({
            type: "rectangle",
            id: diagramNodeFrameElementId(node.elementId),
            ...frame,
            strokeColor: "transparent",
            backgroundColor: "transparent",
            strokeWidth: 1,
            roughness: 0,
            groupIds: [renderGroupId],
          });
        }
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

  const routes = routeStructuredDiagram(entityDiagram);
  const byId = new Map(entityDiagram.nodes.map((node) => [node.id, node]));
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
      start: { id: bindTargetId(from) },
      end: { id: bindTargetId(to) },
      ...(edge.label ? { label: { text: edge.label, fontSize: 11, fontFamily: diagramFontFamily } } : {}),
    });
  }

  // Keep the domain's element ids: replace/selection/label sync all look elements up by them.
  const converted = convertToExcalidrawElements(skeletons, { regenerateIds: false }) as OrderedExcalidrawElement[];
  return [...converted, ...iconLabels];
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
