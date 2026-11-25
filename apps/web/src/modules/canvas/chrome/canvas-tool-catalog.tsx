import type { ComponentType, SVGProps } from "react";
import type { ExcalidrawImperativeAPI, ToolType } from "@excalidraw/excalidraw/types";
import { nativeActionIcon } from "../core/excalidraw-bridge/CanvasNativeActions";
import { NativeArrowIcon, NativeAutoshapeIcon, NativeBucketFillIcon, NativeDiamondIcon, NativeEllipseIcon, NativeEmbedIcon, NativeEraserIcon, NativeFrameIcon, NativeFreedrawIcon, NativeHandIcon, NativeImageIcon, NativeLassoIcon, NativeLineIcon, NativeRectangleIcon, NativeSelectionIcon, NativeTextIcon } from "../core/excalidraw-bridge/CanvasNativeIcons";
export const controlGlyphClass = "size-5";
export type ToolbarTool = ToolType;
type GlyphComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type ToolDefinition = {
  type: ToolbarTool;
  label: string;
  shortcut?: string;
  glyph: GlyphComponent;
  nativeAction?: string;
};
export type ToolGroupDefinition = {
  id: string;
  label: string;
  tools: readonly ToolDefinition[];
};

export const primaryToolGroups: readonly ToolGroupDefinition[] = [
  {
    id: "navigate",
    label: "Navigate",
    tools: [
      { type: "selection", label: "Select", shortcut: "V", glyph: NativeSelectionIcon },
      { type: "hand", label: "Hand", shortcut: "H", glyph: NativeHandIcon },
      { type: "lasso", label: "Lasso select", glyph: NativeLassoIcon },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    tools: [
      { type: "rectangle", label: "Rectangle", shortcut: "R", glyph: NativeRectangleIcon },
      { type: "diamond", label: "Diamond", shortcut: "D", glyph: NativeDiamondIcon },
      { type: "ellipse", label: "Ellipse", shortcut: "O", glyph: NativeEllipseIcon },
    ],
  },
  {
    id: "connectors",
    label: "Lines",
    tools: [
      { type: "arrow", label: "Arrow", shortcut: "A", glyph: NativeArrowIcon },
      { type: "line", label: "Line", shortcut: "L", glyph: NativeLineIcon },
    ],
  },
  {
    id: "draw",
    label: "Draw",
    tools: [
      { type: "freedraw", label: "Draw", shortcut: "P", glyph: NativeFreedrawIcon },
      { type: "eraser", label: "Eraser", shortcut: "E", glyph: NativeEraserIcon },
    ],
  },
  {
    id: "paint",
    label: "Paint",
    tools: [
      { type: "bucketfill", label: "Bucket fill", glyph: NativeBucketFillIcon },
    ],
  },
  {
    id: "text",
    label: "Text",
    tools: [
      { type: "text", label: "Text", shortcut: "T", glyph: NativeTextIcon },
    ],
  },
  {
    id: "insert",
    label: "Insert",
    tools: [
      { type: "image", label: "Image", shortcut: "I", glyph: NativeImageIcon },
      { type: "frame", label: "Frame", shortcut: "F", glyph: NativeFrameIcon },
      { type: "embeddable", label: "Embed", glyph: NativeEmbedIcon },
      { type: "autoshape", label: "Auto shape", glyph: NativeAutoshapeIcon },
    ],
  },
];

export const primaryTools: readonly ToolDefinition[] = primaryToolGroups.flatMap((group) => group.tools);

export function canvasToolName(type: string): string {
  if (type === "freedraw") return "Pen";
  return primaryTools.find((tool) => tool.type === type)?.label ?? "Tool";
}
export function supportedTools(api: ExcalidrawImperativeAPI | null) {
  return new Set((api ? primaryTools.filter(({ type }) => api.app.isToolSupported(type)) : primaryTools).map(({ type }) => type));
}

export function ToolGlyph({ api, tool }: { api: ExcalidrawImperativeAPI | null; tool: ToolDefinition }) {
  const native = nativeActionIcon(api, tool.nativeAction);
  if (native) return <span className="grid place-items-center [&_svg]:size-5">{native}</span>;
  const Glyph = tool.glyph;
  return <Glyph className={controlGlyphClass} aria-hidden="true" />;
}
