import {
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FilePlus2,
  Info,
  Link2,
  Maximize2,
  Minimize2,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "../../../../shared/ui";
import { NOTE_CARD_COLORS, NOTE_CARD_SHAPES, type NoteCardColor, type NoteCardShape } from "../../../../entities/note";
import {
  MenuActionRow,
  MenuDivider,
  MenuSectionHeader,
  segmentedBtnClass,
} from "../../selection/ContextMenuPrimitives";

export type CanvasContextMenuNoteProps = {
  folded: boolean;
  fixedHeight?: boolean;
  color: NoteCardColor;
  shape: NoteCardShape;
  onEdit: () => void;
  onToggleFold: () => void;
  onColorChange: (color: NoteCardColor) => void;
  onShapeChange: (shape: NoteCardShape) => void;
  onExpand: () => void;
  onOpenInfo: () => void;
  onOpenNotePicker?: () => void;
  onFitContent: () => void;
  onPlaceLinked: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onDelete: () => void;
};

export function NoteCardContextMenu({ note, onClose }: { note: CanvasContextMenuNoteProps; onClose: () => void }) {
  return (
    <>
      <div className="grid gap-1.5 px-1.5 pt-1 pb-1.5">
        <MenuSectionHeader title="Note card" />
        <div className="grid gap-1">
          <span className="text-[10px] font-medium text-muted">Color</span>
          <div className="flex items-center gap-1" role="group" aria-label="Card color">
            {NOTE_CARD_COLORS.map((swatch) => {
              const active = note.color === swatch;
              return (
                <button
                  key={swatch}
                  type="button"
                  data-note-color-swatch={swatch}
                  aria-label={`Card color ${swatch}`}
                  aria-pressed={active}
                  title={swatch}
                  className={cn(
                    "size-5 shrink-0 rounded-[5px] border transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent",
                    active && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                  )}
                  onClick={() => note.onColorChange(swatch)}
                />
              );
            })}
          </div>
        </div>
        <div className="grid gap-1">
          <span className="text-[10px] font-medium text-muted">Corners</span>
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="Card shape">
            {NOTE_CARD_SHAPES.map((option) => {
              const active = note.shape === option;
              return (
                <button
                  key={option}
                  type="button"
                  data-note-shape-option={option}
                  aria-label={`Card shape ${option}`}
                  aria-pressed={active}
                  className={cn(
                    segmentedBtnClass,
                    "capitalize",
                    active ? "border-accent bg-tint text-accent" : "border-line bg-canvas text-ink hover:bg-tint hover:text-accent",
                  )}
                  onClick={() => note.onShapeChange(option)}
                >
                  <span className={cn("size-3 border-[1.5px] border-current", option === "rounded" ? "rounded-[4px]" : "rounded-none")} aria-hidden="true" />
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <MenuDivider />

      <MenuActionRow icon={<Pencil className="size-3.5" />} label="Edit" shortcut="Enter" onClick={() => { onClose(); note.onEdit(); }} />
      <MenuActionRow
        icon={note.folded ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
        label={note.folded ? "Unfold" : "Fold"}
        onClick={() => { note.onToggleFold(); onClose(); }}
      />
      <MenuActionRow icon={<Maximize2 className="size-3.5" />} label="Expand" onClick={() => { onClose(); note.onExpand(); }} />
      <MenuActionRow icon={<Info className="size-3.5" />} label="Info & backlinks" onClick={() => { onClose(); note.onOpenInfo(); }} />
      {note.fixedHeight && (
        <MenuActionRow icon={<Minimize2 className="size-3.5" />} label="Fit content" onClick={() => { note.onFitContent(); onClose(); }} />
      )}

      <MenuDivider />

      <MenuActionRow icon={<Copy className="size-3.5" />} label="Duplicate" shortcut="Ctrl+D" onClick={() => { note.onDuplicate(); onClose(); }} />
      <MenuActionRow icon={<Link2 className="size-3.5" />} label="Place linked" onClick={() => { note.onPlaceLinked(); onClose(); }} />
      {note.onOpenNotePicker && (
        <MenuActionRow icon={<FilePlus2 className="size-3.5" />} label="Place existing Note" onClick={() => { onClose(); note.onOpenNotePicker?.(); }} />
      )}

      <MenuDivider />

      <MenuActionRow icon={<Trash2 className="size-3.5 text-danger" />} label="Move to Trash" danger onClick={() => { note.onTrash(); onClose(); }} />
      <MenuActionRow icon={<Trash2 className="size-3.5 text-danger" />} label="Remove instance" shortcut="Del" danger onClick={() => { note.onDelete(); onClose(); }} />
    </>
  );
}
