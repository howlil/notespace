import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Frame, ImageOff, Trash2 } from "lucide-react";
import { IconButton, cn } from "../../components/ui";
import { useImageAssetUrl } from "../assets/use-image-asset-url";
import type { CanvasFrameLinkData, CanvasFramePreviewElement } from "../../features/workspace/canvas-frame-link";

function usePreviewVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return { ref, visible };
}

function imageTransform(element: CanvasFramePreviewElement) {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const rotate = element.angle ? `rotate(${element.angle * 180 / Math.PI} ${centerX} ${centerY})` : "";
  const flipX = element.scale?.[0] === -1;
  const flipY = element.scale?.[1] === -1;
  const flip = flipX || flipY
    ? `translate(${flipX ? centerX * 2 : 0} ${flipY ? centerY * 2 : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`
    : "";
  return [rotate, flip].filter(Boolean).join(" ") || undefined;
}

function CanvasFramePreviewImage({
  element,
  workspaceId,
}: {
  element: CanvasFramePreviewElement;
  workspaceId: string;
}) {
  const src = useImageAssetUrl(workspaceId, element.fileId ?? null);

  if (!src) {
    return (
      <g data-canvas-frame-preview-image={element.id}>
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill="var(--surface)"
          stroke="var(--line)"
          strokeDasharray="4 3"
          transform={imageTransform(element)}
        />
        <foreignObject
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          transform={imageTransform(element)}
        >
          <div className="grid h-full w-full place-items-center text-muted">
            <ImageOff size={Math.max(12, Math.min(24, element.width / 3, element.height / 3))} aria-hidden="true" />
          </div>
        </foreignObject>
      </g>
    );
  }

  return (
    <image
      data-canvas-frame-preview-image={element.id}
      href={src}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      preserveAspectRatio="none"
      transform={imageTransform(element)}
    />
  );
}

function shapeElement(element: CanvasFramePreviewElement, workspaceId: string) {
  const common = {
    stroke: element.strokeColor,
    strokeWidth: element.strokeWidth,
    fill: element.backgroundColor === "transparent" ? "none" : element.backgroundColor,
    opacity: 0.92,
  };
  const transform = element.angle
    ? `rotate(${element.angle * 180 / Math.PI} ${element.x + element.width / 2} ${element.y + element.height / 2})`
    : undefined;

  if (element.type === "image") {
    return <CanvasFramePreviewImage key={element.id} element={element} workspaceId={workspaceId} />;
  }
  if ((element.type === "line" || element.type === "arrow" || element.type === "draw") && element.points?.length) {
    return <polyline key={element.id} points={element.points.map(([x, y]) => `${x},${y}`).join(" ")} {...common} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (element.type === "ellipse") {
    return <ellipse key={element.id} cx={element.x + element.width / 2} cy={element.y + element.height / 2} rx={element.width / 2} ry={element.height / 2} {...common} transform={transform} />;
  }
  if (element.type === "diamond") {
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    return <polygon key={element.id} points={`${cx},${element.y} ${element.x + element.width},${cy} ${cx},${element.y + element.height} ${element.x},${cy}`} {...common} transform={transform} />;
  }
  if (element.type === "text" || element.text) {
    const line = (element.text ?? "").split("\n")[0]?.slice(0, 80) ?? "";
    return (
      <text
        key={element.id}
        x={element.x}
        y={element.y + (element.fontSize ?? 16)}
        fontSize={element.fontSize ?? 16}
        fill={element.strokeColor}
        transform={transform}
      >
        {line}
      </text>
    );
  }
  return <rect key={element.id} x={element.x} y={element.y} width={element.width} height={element.height} rx={Math.min(8, element.width / 8, element.height / 8)} {...common} transform={transform} />;
}

export function CanvasFramePreview({
  preview,
  selected = false,
  onOpen,
  onDelete,
  workspaceId,
}: {
  preview: CanvasFrameLinkData;
  selected?: boolean;
  onOpen?: () => void;
  onDelete?: () => void;
  workspaceId: string;
}) {
  const { ref: previewRef, visible: previewVisible } = usePreviewVisibility();

  return (
    <div className={cn("group relative my-4 overflow-hidden rounded-lg border border-line bg-background", selected && "ring-2 ring-accent/35")}>
      <button
        type="button"
        contentEditable={false}
        className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        aria-label={`Open canvas frame ${preview.label}`}
        onClick={onOpen}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Frame size={14} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate text-[11px] font-medium text-ink">{preview.label}</span>
            <span className="shrink-0 text-[10px] text-muted">{preview.elementCount} object{preview.elementCount === 1 ? "" : "s"}</span>
          </div>
          <ArrowUpRight size={13} className="shrink-0 text-muted" aria-hidden="true" />
        </div>
        <div ref={previewRef} className="h-[180px] w-full bg-[color-mix(in_srgb,var(--background)_90%,var(--tint))] p-3">
          {previewVisible ? (
            <svg
              className="h-full w-full"
              viewBox={`0 0 ${preview.width} ${preview.height}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Preview of ${preview.label}`}
            >
              <rect x="0" y="0" width={preview.width} height={preview.height} fill="transparent" stroke="var(--line)" strokeWidth={Math.max(1, Math.min(preview.width, preview.height) / 180)} />
              {preview.elements.map((element) => shapeElement(element, workspaceId))}
            </svg>
          ) : (
            <div className="h-full w-full" aria-hidden="true" data-canvas-frame-preview-deferred />
          )}
        </div>
      </button>
      {onDelete && (
        <IconButton
          type="button"
          contentEditable={false}
          className="absolute right-2 top-2 !size-6 bg-surface/90 text-muted opacity-0 shadow-sm transition-opacity hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label="Remove canvas frame link"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
        >
          <Trash2 size={12} />
        </IconButton>
      )}
    </div>
  );
}

function CanvasFrameLinkNodeView({ node, selected, deleteNode, onOpen, workspaceId }: NodeViewProps & { onOpen: (frameId: string) => void; workspaceId: string }) {
  const preview = node.attrs.preview as CanvasFrameLinkData | null;
  if (!preview || typeof preview.frameId !== "string") {
    return <NodeViewWrapper className="my-4 rounded-lg border border-dashed border-line p-3 text-[11px] text-muted">Canvas frame preview is unavailable.</NodeViewWrapper>;
  }
  return (
    <NodeViewWrapper className="block" data-canvas-frame-link={preview.frameId}>
      <CanvasFramePreview preview={preview} selected={selected} onOpen={() => onOpen(preview.frameId)} onDelete={deleteNode} workspaceId={workspaceId} />
    </NodeViewWrapper>
  );
}

function encodedPreview(value: unknown) {
  try { return encodeURIComponent(JSON.stringify(value)); } catch { return ""; }
}

function decodedPreview(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(decodeURIComponent(value)); } catch { return null; }
}

export function createCanvasFrameLinkExtension(workspaceId: string, onOpen: (frameId: string) => void) {
  return TiptapNode.create({
    name: "canvasFrameLink",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        frameId: { default: null },
        label: { default: "Canvas frame" },
        preview: { default: null },
      };
    },
    parseHTML() {
      return [{
        tag: "div[data-canvas-frame-link]",
        getAttrs: (node) => node instanceof HTMLElement ? {
          frameId: node.dataset.canvasFrameLink ?? null,
          label: node.dataset.canvasFrameLabel ?? "Canvas frame",
          preview: decodedPreview(node.dataset.canvasFramePreview ?? null),
        } : false,
      }];
    },
    renderHTML({ node, HTMLAttributes }) {
      const attributes = { ...HTMLAttributes };
      delete attributes.frameId;
      delete attributes.label;
      delete attributes.preview;
      return ["div", mergeAttributes(attributes, {
        "data-canvas-frame-link": node.attrs.frameId,
        "data-canvas-frame-label": node.attrs.label,
        "data-canvas-frame-preview": encodedPreview(node.attrs.preview),
      }), node.attrs.label || "Canvas frame"];
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) => <CanvasFrameLinkNodeView {...props} onOpen={onOpen} workspaceId={workspaceId} />);
    },
  });
}

export function canvasFrameLinkNode(preview: CanvasFrameLinkData) {
  return {
    type: "canvasFrameLink",
    attrs: {
      frameId: preview.frameId,
      label: preview.label,
      preview,
    },
  };
}
