import { useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../shared/ui";

export function CanvasConflictRecovery({ open, onOpenChange, onRetry, onUseSaved, readExport, workspaceId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => Promise<void>;
  onUseSaved: () => Promise<void>;
  readExport: () => string;
  workspaceId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const recover = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
      setConfirmDiscard(false);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([readExport()], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${workspaceId}-draft.excalidraw`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download the draft.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (busy) return;
      setConfirmDiscard(false);
      onOpenChange(next);
    }}>
      <DialogContent aria-label="Recover Canvas changes">
        <DialogTitle>Recover Canvas changes</DialogTitle>
        <DialogDescription>
          Your Canvas changed elsewhere. Download your current draft, or retry merging it with the latest saved Canvas.
        </DialogDescription>
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
        {confirmDiscard && <p role="alert" className="mt-3 text-xs text-danger">Using the saved Canvas removes your unsaved local changes. Download your draft first if you want to keep a copy.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void recover(onRetry)}>{busy ? "Recovering…" : "Retry merged save"}</Button>
          <Button variant="secondary" disabled={busy} onClick={download}>Download draft</Button>
          <Button variant={confirmDiscard ? "danger" : "secondary"} disabled={busy} onClick={() => {
            if (confirmDiscard) void recover(onUseSaved);
            else setConfirmDiscard(true);
          }}>{confirmDiscard ? "Discard local and use saved" : "Use saved Canvas"}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { setConfirmDiscard(false); onOpenChange(false); }}>Keep editing</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
