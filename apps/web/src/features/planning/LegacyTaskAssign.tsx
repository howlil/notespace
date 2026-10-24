import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../../shared/ui";
import { assignStandaloneTask, getAnyTask } from "../../adapters/http/planning-api";
import { listAllWorkspaces } from "../../adapters/http/workspace-api";
import { useToast } from "../../shared/ui/toast-provider";
import type { PlanningTask } from "../../domain/planning/planning";
import type { WorkspaceSummary } from "../../domain/workspace/workspace";

export function LegacyTaskAssign({ task, onClose, onAssigned }: {
  task: PlanningTask | null;
  onClose: () => void;
  onAssigned: (updated: PlanningTask) => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!task) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    setWorkspaceId("");
    const load = async () => {
      const results: WorkspaceSummary[] = [];
      let offset = 0;
      while (true) {
        const page = await listAllWorkspaces({ offset, limit: 100 });
        results.push(...page.items);
        if (page.nextOffset == null || page.nextOffset <= offset) return results;
        offset = page.nextOffset;
      }
    };
    void load().then((results) => { if (active) setItems(results); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [task, attempt]);

  async function assign() {
    if (!task || !workspaceId || saving) return;
    setSaving(true);
    try {
      const updated = await assignStandaloneTask(task.id, workspaceId, task.version);
      await onAssigned(updated);
      onClose();
    } catch (error) {
      try {
        const current = await getAnyTask(task.id);
        if (current.workspaceId === workspaceId && current.version === task.version + 1) {
          await onAssigned(current);
          onClose();
          showToast({ kind: "success", message: "Task was already assigned; no duplicate was made." });
          return;
        }
      } catch {
        // Unknown response: retain Task and destination, require manual retry/reload.
      }
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not confirm assignment. Check Task status before retrying." });
    } finally { setSaving(false); }
  }

  return <Dialog open={task !== null} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="w-[min(94vw,470px)]">
      <DialogTitle>Assign legacy Task to Workspace</DialogTitle>
      <DialogDescription>Keep the same Task ID, completion, planned date and Activity references. No copy will be created.</DialogDescription>
      <p className="mt-3 rounded-md border border-line bg-canvas px-3 py-2 text-xs">{task?.title}</p>
      <label className="mt-3 grid gap-1.5 text-[11px] font-medium text-ink">
        Destination Workspace
        <select aria-label="Destination Workspace" className="min-h-9 rounded-md border border-line bg-background px-2.5 text-xs"
          value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} disabled={saving || loading || failed}>
          <option value="">{loading ? "Loading…" : "Select Workspace"}</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      {failed && <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>Retry loading workspaces</Button>}
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => void assign()} disabled={saving || !workspaceId || loading || failed}>{saving ? "Assigning…" : "Assign Workspace"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
