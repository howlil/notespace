import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { FileText } from "lucide-react";
import { useMemo } from "react";
import type { Note } from "../../../domain/workspace/workspace";
import { notePreviewText, readCanvasNoteArtifact } from "./canvas-note-artifact";

type CanvasViewport = {
  zoom: number;
  scrollX: number;
  scrollY: number;
};

type NoteArtifactElement = OrderedExcalidrawElement & {
  customData?: Record<string, unknown>;
};

export function CanvasNoteArtifactLayer({
  elements,
  viewport,
  notes,
  selectedElementId,
}: {
  elements: readonly OrderedExcalidrawElement[];
  viewport: CanvasViewport;
  notes: readonly Note[];
  selectedElementId: string | null;
}) {
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);

  const artifacts = elements
    .filter((element) => !element.isDeleted)
    .map((element) => ({ element: element as NoteArtifactElement, artifact: readCanvasNoteArtifact(element as NoteArtifactElement) }))
    .filter((entry): entry is { element: NoteArtifactElement; artifact: NonNullable<ReturnType<typeof readCanvasNoteArtifact>> } => entry.artifact !== null);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Canvas note artifacts">
      {artifacts.map(({ element, artifact }) => {
        const note = noteById.get(artifact.noteId);
        const selected = selectedElementId === element.id;
        const zoom = viewport.zoom;
        const left = (element.x + viewport.scrollX) * zoom;
        const top = (element.y + viewport.scrollY) * zoom;
        const width = Math.max(1, element.width * zoom);
        const height = Math.max(1, element.height * zoom);
        const compact = artifact.displayMode === "compact";
        const titleSize = Math.max(9, 12 * zoom);
        const bodySize = Math.max(8, 10 * zoom);
        const padding = Math.max(6, 10 * zoom);
        const preview = note ? notePreviewText(note) : "";

        return (
          <article
            key={element.id}
            data-canvas-note-artifact={element.id}
            className="absolute overflow-hidden rounded-[6px]"
            style={{
              left,
              top,
              width,
              height,
              transform: `rotate(${element.angle}rad)`,
              transformOrigin: "center",
              background: "var(--surface)",
              color: "var(--ink)",
              border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
              boxShadow: selected ? "0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent)" : "none",
              padding,
            }}
            aria-label={note ? `Linked note: ${note.title}` : "Linked note unavailable"}
          >
            <div className="flex min-w-0 items-center gap-2" style={{ marginBottom: compact ? 0 : Math.max(4, 7 * zoom) }}>
              <span className="grid shrink-0 place-items-center rounded-md bg-tint text-accent" style={{ width: Math.max(18, 24 * zoom), height: Math.max(18, 24 * zoom) }}>
                <FileText style={{ width: Math.max(10, 13 * zoom), height: Math.max(10, 13 * zoom) }} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" style={{ fontSize: titleSize, lineHeight: 1.25 }}>
                  {note?.title ?? "Note unavailable"}
                </div>
                {compact && <div className="truncate text-muted" style={{ fontSize: Math.max(7, 8 * zoom), lineHeight: 1.2 }}>Note</div>}
              </div>
            </div>

            {!compact && (
              <div className="grid min-h-0 gap-1">
                <p
                  className="m-0 overflow-hidden text-muted"
                  style={{
                    fontSize: bodySize,
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {note ? (preview || "Empty note") : "This note no longer exists in the workspace."}
                </p>
                <span className="mt-1 text-muted" style={{ fontSize: Math.max(7, 8 * zoom), lineHeight: 1.2 }}>Note · double-click to open</span>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
