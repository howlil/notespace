import { ExternalLink, Rows3, Square, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../shared/ui";
import type { CanvasNoteArtifactData } from "./canvas-note-artifact";

function ActionButton({
  label,
  danger,
  children,
  onClick,
}: {
  label: string;
  danger?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent",
        danger && "hover:bg-danger/10 hover:text-danger",
      )}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CanvasNoteArtifactActions({
  artifact,
  onOpen,
  onToggleDisplayMode,
  onDelete,
}: {
  artifact: CanvasNoteArtifactData;
  onOpen: () => void;
  onToggleDisplayMode: () => void;
  onDelete: () => void;
}) {
  const compact = artifact.displayMode === "compact";
  return (
    <div
      className="notespace-selection-actions pointer-events-auto relative z-[1] flex h-10 max-w-full items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-none [&~_.excalidraw_.mobile-shape-actions]:!hidden"
      role="toolbar"
      aria-label="Linked note actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ActionButton label="Open linked note" onClick={onOpen}><ExternalLink className="size-3.5" /></ActionButton>
      <ActionButton label={compact ? "Show note preview" : "Compact note card"} onClick={onToggleDisplayMode}>
        {compact ? <Rows3 className="size-3.5" /> : <Square className="size-3.5" />}
      </ActionButton>
      <ActionButton label="Remove from canvas" danger onClick={onDelete}><Trash2 className="size-3.5" /></ActionButton>
    </div>
  );
}
