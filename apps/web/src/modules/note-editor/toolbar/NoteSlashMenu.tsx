import {
  ChevronRight,
  CodeXml,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Scissors,
  Sigma,
  StickyNote,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";
import type { NoteSlashCommand, NoteSlashCommandId } from "../model/note-slash";
import type { CaretPosition } from "./editor-positioning";

const NOTE_SLASH_ICONS: Record<NoteSlashCommandId, LucideIcon> = {
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  orderedList: ListOrdered,
  taskList: ListTodo,
  toggle: ChevronRight,
  codeBlock: CodeXml,
  blockquote: Quote,
  callout: Info,
  divider: Minus,
  table: TableIcon,
  image: ImageIcon,
  math: Sigma,
  embedNote: StickyNote,
  blockReference: Link2,
  extractToNote: Scissors,
};

type NoteSlashMenuProps = {
  commands: readonly NoteSlashCommand[];
  activeIndex: number;
  position: CaretPosition;
  onSelect: (commandId: NoteSlashCommandId) => void;
};

export function NoteSlashMenu({
  commands,
  activeIndex,
  position,
  onSelect,
}: NoteSlashMenuProps) {
  if (commands.length === 0) return null;
  const resolvedIndex = activeIndex % commands.length;

  return (
    <div
      className="notespace-note-ui no-scrollbar absolute z-[var(--z-popover)] grid max-h-60 min-w-44 gap-0.5 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 [box-shadow:var(--shadow-popup)]"
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label="Note slash commands"
    >
      {commands.map((command, index) => {
        const Icon = NOTE_SLASH_ICONS[command.id];
        return (
          <button
            key={command.id}
            type="button"
            className={"flex items-center gap-1.5 rounded px-2 py-1 text-left text-2xs text-ink hover:bg-tint " + (index === resolvedIndex ? "bg-tint text-accent" : "")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command.id)}
          >
            <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            {command.label}
          </button>
        );
      })}
    </div>
  );
}
