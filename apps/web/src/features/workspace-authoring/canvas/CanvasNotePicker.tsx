import { FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "../../../domain/workspace/workspace";
import { notePreviewText } from "./canvas-note-artifact";

export function CanvasNotePicker({
  notes,
  onSelect,
  onClose,
}: {
  notes: readonly Note[];
  onSelect: (noteId: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return notes;
    return notes.filter((note) => note.title.toLowerCase().includes(normalized) || notePreviewText(note, 240).toLowerCase().includes(normalized));
  }, [notes, query]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (panelRef.current?.contains(target as Node)) return;
      if (target instanceof Element && target.closest("[data-note-picker-trigger]")) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute bottom-[58px] left-1/2 z-[1000] grid w-[290px] max-w-[calc(100%-20px)] -translate-x-1/2 gap-2 rounded-lg border border-line bg-surface p-2 shadow-none"
      role="dialog"
      aria-label="Link note to canvas"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-2">
        <Search className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <input
          autoFocus
          className="h-8 min-w-0 flex-1 border-0 bg-transparent text-[10px] text-ink outline-none placeholder:text-muted"
          placeholder="Find a note…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Find a note"
        />
      </div>
      <div className="grid max-h-64 gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((note) => (
          <button
            key={note.id}
            type="button"
            className="flex min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => onSelect(note.id)}
          >
            <FileText className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate text-[10px] font-medium text-ink">{note.title}</span>
              <span className="truncate text-[9px] text-muted">{notePreviewText(note, 100) || "Empty note"}</span>
            </span>
          </button>
        ))}
        {visible.length === 0 && <div className="px-2 py-4 text-center text-[10px] text-muted">No matching notes.</div>}
      </div>
    </div>
  );
}
