import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../../components/ui";
import { snapshotToMarkdown } from "../../domain/document/markdown";
import { subscribeWorkspaceConflict } from "../../domain/project/conflict-recovery";
import type { WorkspaceConflictDraft } from "../../domain/project/conflict-recovery";
import { useToast } from "../../providers/toast-provider";

function notesMarkdown(draft: WorkspaceConflictDraft) {
  return draft.local.notes
    .map((note) => `# ${note.title}\n\n${snapshotToMarkdown(note.document).trim()}`)
    .join("\n\n---\n\n")
    .trim();
}

function downloadDraft(draft: WorkspaceConflictDraft) {
  const blob = new Blob([JSON.stringify({
    format: "notespace-conflict-draft",
    exportedAt: new Date().toISOString(),
    workspaceId: draft.workspaceId,
    local: draft.local,
    latestVersion: draft.latest.version,
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `notespace-conflict-${draft.workspaceId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ConflictRecoveryDialog() {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<WorkspaceConflictDraft | null>(null);

  useEffect(() => subscribeWorkspaceConflict(setDraft), []);

  async function copyNotes() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(notesMarkdown(draft));
      showToast({ kind: "success", message: "Local note draft copied as Markdown." });
    } catch {
      showToast({ kind: "error", message: "Could not copy the local draft. Download the recovery copy instead." });
    }
  }

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
      <DialogContent className="w-[min(94vw,560px)]">
        <DialogTitle>Workspace changed elsewhere</DialogTitle>
        <DialogDescription>
          Your local edits are still open in this tab and have not overwritten the newer saved Workspace. Preserve anything you need before loading the latest version.
        </DialogDescription>
        <div className="mt-4 rounded-md border border-line bg-tint/40 p-3 text-[11px] leading-5 text-ink">
          Autosave is paused for this conflict. You can keep this tab open, copy the local Notes as Markdown, or download the complete local Workspace draft including Canvas state.
        </div>
        <DialogFooter className="mt-4 flex-wrap">
          <Button variant="secondary" onClick={() => setDraft(null)}>Keep local open</Button>
          <Button variant="secondary" onClick={() => void copyNotes()}>Copy notes</Button>
          <Button variant="secondary" onClick={() => { if (draft) downloadDraft(draft); }}>Download local copy</Button>
          <Button onClick={() => window.location.reload()}>Reload latest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
