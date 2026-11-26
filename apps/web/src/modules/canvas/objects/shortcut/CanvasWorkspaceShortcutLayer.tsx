import { ArrowUpRight, FolderKanban } from "lucide-react";
import { useMemo, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { readCanvasWorkspaceShortcut } from "../../../../entities/workspace-shortcut";

type ShortcutViewport = { scrollX: number; scrollY: number; zoom: number };

function shortcutFrameStyle(element: OrderedExcalidrawElement, viewport: ShortcutViewport): CSSProperties {
  const zoom = viewport.zoom > 0 && Number.isFinite(viewport.zoom) ? viewport.zoom : 1;
  const angle = element.angle ?? 0;
  const halfWidth = element.width / 2;
  const halfHeight = element.height / 2;
  const rotation = angle
    ? ` translate(${halfWidth}px, ${halfHeight}px) rotate(${angle}rad) translate(${-halfWidth}px, ${-halfHeight}px)`
    : "";
  return {
    left: (element.x + viewport.scrollX) * zoom,
    top: (element.y + viewport.scrollY) * zoom,
    width: element.width,
    height: element.height,
    transform: `scale(${zoom})${rotation}`,
    transformOrigin: "0 0",
  };
}

export function CanvasWorkspaceShortcutLayer({
  elements,
  viewport,
  workspaceTitles,
  selectedElementId = null,
  onOpenWorkspace,
  onRemoveMissing,
}: {
  elements: readonly OrderedExcalidrawElement[];
  viewport: ShortcutViewport;
  workspaceTitles: ReadonlyMap<string, string>;
  selectedElementId?: string | null;
  onOpenWorkspace: (workspaceId: string, options?: { background?: boolean }) => void;
  onRemoveMissing?: (elementId: string) => void;
}) {
  const shortcuts = useMemo(() => elements.flatMap((element) => {
    const reference = readCanvasWorkspaceShortcut(element);
    return reference ? [{ element, reference }] : [];
  }), [elements]);

  if (shortcuts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[4] overflow-visible" aria-label="Workspace shortcuts">
      {shortcuts.map(({ element, reference }) => {
        const title = workspaceTitles.get(reference.targetWorkspaceId);
        const isAvailable = typeof title === "string";
        const isSelected = selectedElementId === element.id;
        const style = shortcutFrameStyle(element, viewport);

        const handleOpen = (event: MouseEvent | KeyboardEvent) => {
          if (!isAvailable) return;
          event.stopPropagation();
          onOpenWorkspace(reference.targetWorkspaceId, {
            background: event.ctrlKey || event.metaKey || event.altKey,
          });
        };

        return (
          <div
            key={element.id}
            role="button"
            tabIndex={0}
            data-workspace-shortcut-element={element.id}
            data-target-workspace-id={reference.targetWorkspaceId}
            aria-label={isAvailable ? `Open workspace ${title}` : "Unavailable workspace"}
            style={style}
            onDoubleClick={handleOpen}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleOpen(event);
              }
            }}
            className={
              "pointer-events-auto absolute flex select-none flex-col justify-between rounded-lg border bg-surface px-3.5 py-3 text-ink shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40 "
              + (isAvailable ? "cursor-pointer hover:bg-tint/40 " : "cursor-default ")
              + (isSelected ? "border-accent/70 ring-2 ring-accent/15" : "border-line")
            }
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted">
              <span className="inline-flex items-center gap-1.5">
                <FolderKanban className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>Workspace</span>
              </span>
              {isAvailable && <ArrowUpRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
            </div>

            {isAvailable ? (
              <div className="line-clamp-2 text-[14px] font-medium leading-snug text-ink">
                {title}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-danger">Unavailable workspace</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveMissing?.(element.id);
                  }}
                  className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-danger hover:bg-tint"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
