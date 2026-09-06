import { useEffect, useMemo, useState } from "react";
import { Eye, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../../components/ui";
import type { Note } from "../../domain/project/project";
import { snapshotToMarkdown } from "../../domain/document/markdown";

export function RecallMode({ note, open, onOpenChange }: { note: Note | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [response, setResponse] = useState("");
  const [revealed, setRevealed] = useState(false);
  const source = useMemo(() => note ? snapshotToMarkdown(note.document).trim() : "", [note]);

  useEffect(() => {
    if (!open) {
      setResponse("");
      setRevealed(false);
    }
  }, [open, note?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,700px)]">
        <DialogTitle>{note ? `Recall · ${note.title}` : "Recall"}</DialogTitle>
        <DialogDescription>Write what you remember before revealing the source. Nothing here changes the note or produces a score.</DialogDescription>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-[11px] font-medium text-ink">
            From memory
            <textarea
              autoFocus
              className="min-h-40 resize-y rounded-md border border-line bg-background px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-muted focus:border-accent"
              placeholder="Explain the idea, reconstruct the steps, or write the details you can recall…"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
            />
          </label>

          {revealed && (
            <section className="grid gap-1.5 border-t border-line pt-3" aria-label="Source note">
              <span className="text-[11px] font-medium text-ink">Source</span>
              <pre className="m-0 max-h-[38dvh] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-3 font-sans text-xs leading-5 text-ink">{source || "This note has no text content to reveal."}</pre>
            </section>
          )}
        </div>

        <DialogFooter>
          {revealed ? (
            <Button variant="secondary" onClick={() => onOpenChange(false)}><X size={13} /> Done</Button>
          ) : (
            <Button onClick={() => setRevealed(true)} disabled={!note}><Eye size={13} /> Reveal source</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
