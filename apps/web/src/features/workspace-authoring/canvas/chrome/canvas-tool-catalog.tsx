import type { ComponentType, SVGProps } from "react";
import type { ExcalidrawImperativeAPI, ToolType } from "@excalidraw/excalidraw/types";
import { nativeActionIcon } from "../native/CanvasNativeActions";
import { NativeArrowIcon, NativeAutoshapeIcon, NativeBucketFillIcon, NativeDiamondIcon, NativeEllipseIcon, NativeEmbedIcon, NativeEraserIcon, NativeFrameIcon, NativeFreedrawIcon, NativeHandIcon, NativeImageIcon, NativeLaserIcon, NativeLassoIcon, NativeLineIcon, NativeMagicIcon, NativeRectangleIcon, NativeSelectionIcon, NativeTextIcon } from "../native/CanvasNativeIcons";
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
export const primaryTools: readonly ToolDefinition[] = [
  { type: "selection", label: "Select", shortcut: "V", glyph: NativeSelectionIcon },
  { type: "hand", label: "Hand", shortcut: "H", glyph: NativeHandIcon },
  { type: "rectangle", label: "Rectangle", shortcut: "R", glyph: NativeRectangleIcon },
  { type: "diamond", label: "Diamond", shortcut: "D", glyph: NativeDiamondIcon },
  { type: "ellipse", label: "Ellipse", shortcut: "O", glyph: NativeEllipseIcon },
  { type: "arrow", label: "Arrow", shortcut: "A", glyph: NativeArrowIcon },
  { type: "line", label: "Line", shortcut: "L", glyph: NativeLineIcon },
  { type: "freedraw", label: "Draw", shortcut: "P", glyph: NativeFreedrawIcon },
  { type: "text", label: "Text", shortcut: "T", glyph: NativeTextIcon },
  { type: "image", label: "Image", shortcut: "I", glyph: NativeImageIcon },
  { type: "eraser", label: "Eraser", shortcut: "E", glyph: NativeEraserIcon },
];

export const secondaryToolGroups: readonly { label: string; tools: readonly ToolDefinition[] }[] = [
  {
    label: "Select",
    tools: [{ type: "lasso", label: "Lasso select", glyph: NativeLassoIcon }],
  },
  {
    label: "Insert",
    tools: [
      { type: "frame", label: "Frame", shortcut: "F", glyph: NativeFrameIcon },
      { type: "embeddable", label: "Embed", glyph: NativeEmbedIcon },
      { type: "autoshape", label: "Auto shape", glyph: NativeAutoshapeIcon },
      { type: "magicframe", label: "Magic frame", glyph: NativeMagicIcon },
    ],
  },
  {
    label: "Present",
    tools: [{ type: "laser", label: "Laser pointer", glyph: NativeLaserIcon }],
  },
  {
    label: "Paint",
    tools: [{ type: "bucketfill", label: "Bucket fill", glyph: NativeBucketFillIcon }],
  },
];

export const secondaryTools = secondaryToolGroups.flatMap(({ tools }) => tools);

export function canvasToolName(type: string): string {
  if (type === "freedraw") return "Pen";
  return primaryTools.find((tool) => tool.type === type)?.label ?? secondaryTools.find((tool) => tool.type === type)?.label ?? "Tool";
}
export function supportedTools(api: ExcalidrawImperativeAPI | null) {
  const tools = [...primaryTools, ...secondaryTools];
  return new Set((api ? tools.filter(({ type }) => api.app.isToolSupported(type)) : tools).map(({ type }) => type));
}

export function ToolGlyph({ api, tool }: { api: ExcalidrawImperativeAPI | null; tool: ToolDefinition }) {
  const native = nativeActionIcon(api, tool.nativeAction);
  if (native) return <span className="grid place-items-center [&_svg]:size-5">{native}</span>;
  const Glyph = tool.glyph;
  return <Glyph className={controlGlyphClass} aria-hidden="true" />;
}
