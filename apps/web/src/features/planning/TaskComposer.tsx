import { useEffect, useState, type FormEvent, type RefObject } from "react";
import { Circle, Plus } from "lucide-react";
import { Button, Input } from "../../shared/ui";
import { listAllWorkspaces } from "../../adapters/http/workspace-api";
import { createTask } from "../../adapters/http/planning-api";
import { creationIdentity, confirmCreation, confirmKeyedPost, pendingCreation } from "../../adapters/browser/planning-create-identity";
import type { PlanningTask } from "../../domain/planning/planning";
import type { WorkspaceSummary } from "../../domain/workspace/workspace";
import { workspaceOptionLabel } from "../../domain/workspace/workspace-option-label";
import { useToast } from "../../shared/ui/toast-provider";

type Props = {
  workspaceId?: string;
  milestoneId?: string;
  plannedFor?: string;
  titleLabel?: string;
  inputRef?: RefObject<HTMLInputElement>;
  onCreated: (task: PlanningTask) => void | Promise<void>;
  onCancel?: () => void;
};

export function TaskComposer({ workspaceId, milestoneId, plannedFor, titleLabel = "Task title", inputRef, onCreated, onCancel }: Props) {
  const { showToast } = useToast();
  const scope = `task:${workspaceId ?? "global"}:${milestoneId ?? ""}:${plannedFor ?? ""}`;
  const savedDraft = (() => {
    try {
      const value = pendingCreation(scope);
      return value ? JSON.parse(value.payload) as { title: string; destination: string } : null;
    } catch { return null; }
  })();
  const [title, setTitle] = useState(savedDraft?.title ?? "");
  const [selected, setSelected] = useState(workspaceId ? "" : savedDraft?.destination ?? "");
  const [options, setOptions] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(!workspaceId);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (workspaceId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    async function load() {
      const results: WorkspaceSummary[] = [];
      let offset = 0;
      let snapshot = "start";
      for (;;) {
        const page = await listAllWorkspaces({ offset, limit: 100, snapshot });
        snapshot = page.snapshot ?? snapshot;
        results.push(...page.items);
        if (page.nextOffset == null || page.nextOffset <= offset) break;
        offset = page.nextOffset;
      }
      return results;
    }
    void load().then((items) => {
      if (cancelled) return;
      setOptions(items);
      setSelected((current) => items.some((item) => item.id === current) ? current : "");
    }).catch(() => {
      if (cancelled) return;
      setLoadError(true);
      showToast({ kind: "error", message: "Could not load workspaces for Task creation." });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, reloadKey, showToast]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = title.trim();
    const destination = workspaceId ?? selected;
    if (!name || !destination || saving) return;
    const key = creationIdentity(scope, JSON.stringify({ title: name, destination, milestoneId: milestoneId ?? "", plannedFor: plannedFor ?? "" }));
    setSaving(true);
    try {
      const created = await confirmKeyedPost(() => createTask(destination, name, milestoneId, plannedFor, key));
      confirmCreation(scope, key);
      setTitle("");
      try {
        await onCreated(created);
      } catch {
        showToast({ kind: "error", message: "Task saved, but the view could not refresh. Reload to see it." });
      }
    } catch {
      // Same draft keeps the original key even after remount/reload.
      showToast({ kind: "error", message: "Task save not confirmed. Retry to reconcile this draft safely." });
    } finally { setSaving(false); }
  }

  return (
    <form className="flex min-w-0 flex-wrap items-center gap-2 py-1" onSubmit={(event) => void submit(event)}>
      {workspaceId ? <Circle size={15} className="shrink-0 text-muted" aria-hidden="true" /> : <Plus size={16} className="shrink-0 text-muted" aria-hidden="true" />}
      <Input ref={inputRef} autoFocus={Boolean(workspaceId)} className="min-h-8 min-w-[160px] flex-1 bg-background text-[11px]"
        aria-label={titleLabel} placeholder={plannedFor ? "Task for Today" : "Task title"}
        value={title} disabled={saving} onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape" && onCancel) onCancel(); }} />
      {!workspaceId && <>
        <select aria-label="Task Workspace" className="min-h-8 max-w-[220px] rounded-md border border-line bg-background px-2 text-[11px] text-ink"
          value={selected} onChange={(event) => setSelected(event.target.value)} disabled={loading || saving || loadError}>
          <option value="">{loading ? "Loading…" : options.length ? "Choose Workspace…" : "No Workspace"}</option>
          {options.map((item) => <option value={item.id} key={item.id}>{workspaceOptionLabel(item, options)}</option>)}
        </select>
        {loadError && <Button variant="secondary" size="sm" type="button" onClick={() => setReloadKey((n) => n + 1)}>Retry</Button>}
      </>}
      <Button type="submit" size="sm" disabled={!title.trim() || !destinationIsReady(workspaceId, selected, loading, loadError) || saving}>
        {saving ? "Saving…" : "Add"}
      </Button>
      {onCancel && <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>Cancel</Button>}
      {!workspaceId && !loading && !loadError && !options.length &&
        <span role="status" className="w-full text-[10px] text-muted">Create a Workspace first, or use Capture Queue for unorganized work.</span>}
    </form>
  );
}

function destinationIsReady(workspaceId: string | undefined, selected: string, loading: boolean, failed: boolean) {
  return Boolean(workspaceId || (selected && !loading && !failed));
}
