import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  cn,
} from "../../shared/ui";
import type { NoteSaveState } from "./model/note-store";

export type NoteFocusModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Derived first-line label (from `noteFirstLine(document)`), never a stored title field. */
  label?: string;
  saveState?: NoteSaveState;
  onOpenInfo?: () => void;
  children: ReactNode;
};

const SAVE_STATUS_META: Record<NoteSaveState, { label: string; dotClass: string; textClass: string; urgent: boolean }> = {
  saved: { label: "Saved", dotClass: "bg-success", textClass: "text-success", urgent: false },
  pending: { label: "Unsaved changes", dotClass: "bg-muted", textClass: "text-muted", urgent: false },
  saving: { label: "Saving…", dotClass: "bg-accent", textClass: "text-muted", urgent: false },
  error: { label: "Save failed", dotClass: "bg-danger", textClass: "text-danger", urgent: true },
  conflict: { label: "Save conflict", dotClass: "bg-danger", textClass: "text-danger", urgent: true },
};

/**
 * In-Canvas expanded editor overlay. Renders children at full readable 100% scale
 * without introducing a standalone Note route or changing Canvas zoom.
 */
export function NoteFocusModal({
  open,
  onOpenChange,
  label,
  saveState = "saved",
  onOpenInfo,
  children,
}: NoteFocusModalProps) {
  const displayLabel = label?.trim() || "Canvas Note";
  const status = SAVE_STATUS_META[saveState];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        padded={false}
        className="flex h-[min(82dvh,760px)] flex-col max-[480px]:h-[calc(100dvh_-_24px)]"
        data-note-focus-modal=""
      >
        <DialogDescription className="sr-only">
          Focused Canvas Note editor overlay. Press Escape to return to the Canvas.
        </DialogDescription>
        <DialogHeader
          title={displayLabel}
          closeLabel="Close focused Note"
          onClose={() => onOpenChange(false)}
          className="min-h-11 bg-surface"
          actions={(
            <>
              <span
                className={cn("inline-flex items-center gap-1.5 px-1.5 text-xs font-medium", status.textClass)}
                role={status.urgent ? "alert" : "status"}
                aria-live="polite"
                data-note-focus-save={saveState}
              >
                <span className={cn("size-1.5 rounded-full", status.dotClass)} aria-hidden="true" />
                <span>{status.label}</span>
              </span>
              {onOpenInfo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Note info and backlinks"
                  onClick={onOpenInfo}
                >
                  <Info size={14} aria-hidden="true" />
                  <span>Info</span>
                </Button>
              )}
            </>
          )}
        />
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface px-6 py-4 no-scrollbar max-[480px]:px-3 max-[480px]:py-3"
          data-note-focus-body=""
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
