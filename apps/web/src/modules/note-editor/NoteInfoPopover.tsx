import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from "../../shared/ui";
import { NoteInfoContent } from "./NoteInfoContent";

export type NoteInfoPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string | null;
  /** Optional derived first-line label shown in the panel header. */
  noteLabel?: string;
  currentWorkspaceId?: string;
  /** Invoked when selecting a placement or backlink that lives on the active Canvas. */
  onFocusNote?: (noteId: string) => void;
  onOpenNoteInSideCards?: (noteId: string) => void;
  onPlaceNote?: (noteId: string) => void;
};

/**
 * Compact overlay displaying a Note's live Workspace placements and incoming backlinks.
 */
export function NoteInfoPopover({
  open,
  onOpenChange,
  noteId,
  noteLabel,
  currentWorkspaceId,
  onFocusNote,
  onOpenNoteInSideCards,
  onPlaceNote,
}: NoteInfoPopoverProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        padded={false}
        data-note-info-popover=""
      >
        <DialogDescription className="sr-only">
          Workspaces where this Note is placed and Notes that reference it.
        </DialogDescription>
        <DialogHeader
          title="Note info"
          subtitle={noteLabel?.trim() || undefined}
          closeLabel="Close Note info"
          onClose={() => onOpenChange(false)}
          className="min-h-11"
        />

        <div className="max-h-[min(68dvh,460px)] overflow-y-auto overscroll-contain p-3 no-scrollbar">
          <NoteInfoContent
            noteId={noteId}
            active={open}
            currentWorkspaceId={currentWorkspaceId}
            onAfterNavigate={() => onOpenChange(false)}
            onFocusNote={onFocusNote}
            onOpenNoteInSideCards={onOpenNoteInSideCards}
            onPlaceNote={onPlaceNote}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
