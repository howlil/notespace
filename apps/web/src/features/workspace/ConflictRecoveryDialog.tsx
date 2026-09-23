import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../../shared/ui";
import { snapshotToMarkdown } from "../../domain/document/markdown";
import { subscribeWorkspaceConflict } from "../../domain/project/conflict-recovery";
import type { ConflictDraft } from "../../domain/project/conflict-recovery";
import { useToast } from "../../app/providers/toast-provider";

function notesMarkdown(draft: ConflictDraft) {
  if (draft.kind === "canvas") return "";
  if (draft.kind === "note") {
    return `# ${draft.local.title}\n\n${snapshotToMarkdown(draft.local.document).trim()}`.trim();
  }
  return draft.local.notes
    .map((note) => `# ${note.title}\n\n${snapshotToMarkdown(note.document).trim()}`)
    .join("\n\n---\n\n")
    .trim();
}

function downloadDraft(draft: ConflictDraft) {
  const blob = new Blob([JSON.stringify({
    format: "notespace-conflict-draft",
    exportedAt: new Date().toISOString(),
    ...draft,
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `notespace-${draft.kind}-conflict-${draft.workspaceId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function conflictCopy(draft: ConflictDraft | null) {
  if (!draft || draft.kind === "workspace") {
    return {
      title: "Workspace changed elsewhere",
      description: "Your local edits are still open in this tab and have not overwritten the newer saved Workspace.",
      detail: "Autosave is paused for this conflict. Preserve the local draft before loading the latest version.",
    };
  }
  if (draft.kind === "note") {
    return {
      title: "Note changed elsewhere",
      description: "This Note has a newer saved version. Your local Note draft is still open and has not overwritten it.",
      detail: "Only this Note save queue is paused. Other Notes and Canvas can continue saving independently.",
    };
  }
  return {
    title: "Canvas changed elsewhere",
    description: "Automatic Canvas reconciliation could not settle the version race after multiple retries.",
    detail: "The local Canvas draft is still available. Download a recovery copy before loading the latest version.",
  };
}

export function ConflictRecoveryDialog() {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<ConflictDraft | null>(null);

  useEffect(() => subscribeWorkspaceConflict(setDraft), []);

  async function copyNotes() {
    if (!draft || draft.kind === "canvas") return;
    try {
      await navigator.clipboard.writeText(notesMarkdown(draft));
      showToast({ kind: "success", message: "Local note draft copied as Markdown." });
    } catch {
      showToast({ kind: "error", message: "Could not copy the local draft. Download the recovery copy instead." });
    }
  }

  const copy = conflictCopy(draft);

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
      <DialogContent className="w-[min(94vw,560px)]">
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description} Preserve anything you need before loading the latest version.</DialogDescription>
        <div className="mt-4 rounded-md border border-line bg-tint/40 p-3 text-[11px] leading-5 text-ink">
          {copy.detail}
        </div>
        <DialogFooter className="mt-4 flex-wrap">
          <Button variant="secondary" onClick={() => setDraft(null)}>Keep local open</Button>
          {draft?.kind !== "canvas" && <Button variant="secondary" onClick={() => void copyNotes()}>Copy notes</Button>}
          <Button variant="secondary" onClick={() => { if (draft) downloadDraft(draft); }}>Download local copy</Button>
          <Button onClick={() => window.location.reload()}>Reload latest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
