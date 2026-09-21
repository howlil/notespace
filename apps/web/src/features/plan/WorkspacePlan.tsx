import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarCheck2, CalendarPlus, Check, CheckCircle2, Circle, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  IconButton,
  Input,
  Skeleton,
  cn,
} from "../../components/ui";
import {
  createMilestone,
  createTask,
  deleteMilestone,
  deleteTask,
  getWorkspacePlan,
  updateMilestone,
  updateTask,
} from "../../domain/planning/api";
import {
  localDateKey,
  milestoneProgress,
  tasksForMilestone,
  type PlanningMilestone,
  type PlanningTask,
  type WorkspacePlan as WorkspacePlanModel,
} from "../../domain/planning/planning";
import { useToast } from "../../providers/toast-provider";
import { useDismissablePopup } from "../../components/ui/dismissable";
import { ActivityTypeMenu } from "../study/ActivityTypeMenu";
import type { ActivityType } from "../../domain/activity/api";

type DeleteTarget =
  | { kind: "milestone"; item: PlanningMilestone }
  | { kind: "task"; item: PlanningTask }
  | null;

function emptyPlan(workspaceId: string): WorkspacePlanModel {
  return { workspaceId, milestones: [], tasks: [] };
}

function InlineCreate({
  placeholder,
  onCreate,
  onCancel,
}: {
  placeholder: string;
  onCreate: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const title = value.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await onCreate(title);
      setValue("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex items-center gap-2 py-1" onSubmit={submit}>
      <Circle size={15} className="shrink-0 text-muted" aria-hidden="true" />
      <Input
        autoFocus
        className="min-h-8 flex-1 bg-background text-[11px]"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        disabled={saving}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
      />
      <Button type="submit" size="sm" className="!min-h-8 px-2.5 text-[10px]" disabled={!value.trim() || saving}>
        {saving ? "Adding…" : "Add"}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="!min-h-8 px-2 text-[10px]" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
    </form>
  );
}

function TaskRow({
  task,
  activityBusy,
  onStartActivity,
  onUpdate,
  onDelete,
}: {
  task: PlanningTask;
  activityBusy: boolean;
  onStartActivity: (task: PlanningTask, activityType: ActivityType) => void;
  onUpdate: (task: PlanningTask, patch: { title?: string; completed?: boolean; plannedFor?: string }) => Promise<void>;
  onDelete: (task: PlanningTask) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [saving, setSaving] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const startRef = useRef<HTMLDivElement>(null);

  useDismissablePopup(startRef, startOpen, () => setStartOpen(false));
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => {
    if (activityBusy) setStartOpen(false);
  }, [activityBusy]);

  async function commitTitle() {
    const next = title.trim();
    setEditing(false);
    if (!next || next === task.title || saving) {
      setTitle(task.title);
      return;
    }
    setSaving(true);
    try {
      await onUpdate(task, { title: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group flex min-h-9 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-tint/60">
      <button
        type="button"
        className={cn("grid size-6 shrink-0 place-items-center rounded-md text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", task.completedAt && "text-success")}
        aria-label={task.completedAt ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        onClick={() => void onUpdate(task, { completed: !task.completedAt })}
      >
        {task.completedAt ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      </button>
      {editing ? (
        <Input
          autoFocus
          className="min-h-7 flex-1 rounded-none border-0 bg-transparent px-0 text-[11px]"
          aria-label="Task title"
          value={title}
          disabled={saving}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") { setTitle(task.title); setEditing(false); }
          }}
        />
      ) : (
        <button
          type="button"
          className={cn("min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[11px] text-ink", task.completedAt && "text-muted line-through")}
          onDoubleClick={() => setEditing(true)}
          title="Double-click to rename"
        >
          {task.title}
        </button>
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        {!task.completedAt && (
          <div ref={startRef} className="relative">
            <IconButton
              className="!size-7 text-muted hover:text-accent"
              aria-label={`Start activity for ${task.title}`}
              aria-haspopup="menu"
              aria-expanded={startOpen}
              title={activityBusy ? "End the active activity first" : "Start activity"}
              disabled={activityBusy}
              onClick={() => setStartOpen((value) => !value)}
            >
              <Play size={13} />
            </IconButton>
            {startOpen && (
              <ActivityTypeMenu
                className="absolute top-[calc(100%+4px)] right-0"
                onSelect={(activityType) => {
                  setStartOpen(false);
                  onStartActivity(task, activityType);
                }}
              />
            )}
          </div>
        )}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton
            className={cn("!size-7 text-muted hover:text-accent", task.plannedFor === localDateKey() && "text-accent")}
            aria-label={task.plannedFor === localDateKey() ? `Remove ${task.title} from Today` : `Add ${task.title} to Today`}
            title={task.plannedFor === localDateKey() ? "Remove from Today" : "Add to Today"}
            onClick={() => void onUpdate(task, { plannedFor: task.plannedFor === localDateKey() ? "" : localDateKey() })}
          >
            {task.plannedFor === localDateKey() ? <CalendarCheck2 size={13} /> : <CalendarPlus size={13} />}
          </IconButton>
          <IconButton className="!size-7 text-muted hover:text-accent" aria-label={`Rename ${task.title}`} title="Rename task" onClick={() => setEditing(true)}>
            <Pencil size={13} />
          </IconButton>
          <IconButton className="!size-7 text-muted hover:text-danger" aria-label={`Delete ${task.title}`} title="Delete task" onClick={() => onDelete(task)}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function WorkspacePlan({
  workspaceId,
  activityBusy,
  onStartActivity,
}: {
  workspaceId: string;
  activityBusy: boolean;
  onStartActivity: (task: PlanningTask, activityType: ActivityType) => void;
}) {
  const { showToast } = useToast();
  const [plan, setPlan] = useState<WorkspacePlanModel>(() => emptyPlan(workspaceId));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [taskTarget, setTaskTarget] = useState<{ milestoneId?: string } | null>(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void getWorkspacePlan(workspaceId)
      .then((value) => { if (!cancelled) setPlan(value); })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load workspace plan.";
        setLoadError(message);
        showToast({ kind: "error", message });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast, workspaceId]);

  const milestones = useMemo(
    () => [...plan.milestones].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    [plan.milestones],
  );

  async function addMilestone(title: string) {
    try {
      const item = await createMilestone(workspaceId, title);
      setPlan((current) => ({ ...current, milestones: [...current.milestones, item] }));
      setAddingMilestone(false);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not add milestone." });
    }
  }

  async function addTask(title: string, milestoneId?: string) {
    try {
      const item = await createTask(workspaceId, title, milestoneId);
      setPlan((current) => ({ ...current, tasks: [...current.tasks, item] }));
      setTaskTarget(null);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not add task." });
    }
  }

  async function patchMilestone(item: PlanningMilestone, patch: { title?: string; completed?: boolean }) {
    try {
      const updated = await updateMilestone(workspaceId, item.id, { ...patch, version: item.version });
      setPlan((current) => ({ ...current, milestones: current.milestones.map((value) => value.id === updated.id ? updated : value) }));
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not update milestone." });
    }
  }

  async function patchTask(item: PlanningTask, patch: { title?: string; completed?: boolean; plannedFor?: string }) {
    try {
      const updated = await updateTask(workspaceId, item.id, { ...patch, version: item.version });
      setPlan((current) => ({ ...current, tasks: current.tasks.map((value) => value.id === updated.id ? updated : value) }));
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not update task." });
    }
  }

  function beginMilestoneRename(item: PlanningMilestone) {
    setMilestoneTitle(item.title);
    setEditingMilestoneId(item.id);
  }

  async function commitMilestoneRename(item: PlanningMilestone) {
    const next = milestoneTitle.trim();
    setEditingMilestoneId(null);
    if (!next || next === item.title) {
      setMilestoneTitle(item.title);
      return;
    }
    await patchMilestone(item, { title: next });
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "task") {
        await deleteTask(workspaceId, deleteTarget.item.id, deleteTarget.item.version);
        setPlan((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== deleteTarget.item.id) }));
      } else {
        await deleteMilestone(workspaceId, deleteTarget.item.id, deleteTarget.item.version);
        setPlan((current) => ({
          ...current,
          milestones: current.milestones.filter((item) => item.id !== deleteTarget.item.id),
          tasks: current.tasks.map((task) => task.milestoneId === deleteTarget.item.id ? { ...task, milestoneId: undefined } : task),
        }));
      }
      setDeleteTarget(null);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not delete planning item." });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <section className="mx-auto flex h-full w-full max-w-[760px] flex-col overflow-hidden px-2 py-4" aria-label="Loading workspace plan">
        <div className="grid gap-3"><Skeleton className="h-5 w-24" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-[92%]" /><Skeleton className="mt-5 h-5 w-32" /><Skeleton className="h-9 w-full" /></div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="mx-auto grid h-full w-full max-w-[760px] place-items-center px-4 text-center">
        <div>
          <p className="m-0 text-[12px] text-danger">{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </section>
    );
  }

  const looseTasks = tasksForMilestone(plan);

  return (
    <section className="mx-auto h-full w-full max-w-[760px] overflow-y-auto px-2 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Workspace plan">
      <header className="mb-5 flex items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-ink">Plan</h2>
          <p className="mt-1 mb-0 text-[10px] text-muted">Turn this workspace into concrete checkpoints and next actions.</p>
        </div>
        <Button variant="ghost" size="sm" className="!min-h-8 gap-1 px-2 text-[10px] text-muted hover:text-accent" onClick={() => setAddingMilestone(true)}>
          <Plus size={14} /> Milestone
        </Button>
      </header>

      <div className="grid gap-6">
        {milestones.map((milestone) => {
          const tasks = tasksForMilestone(plan, milestone.id);
          const progress = milestoneProgress(plan, milestone.id);
          return (
            <section key={milestone.id} aria-labelledby={`milestone-${milestone.id}`}>
              <header className="group flex min-h-8 items-center gap-2 border-b border-line pb-2">
                <button
                  type="button"
                  className={cn("grid size-6 shrink-0 place-items-center rounded-md text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", milestone.completedAt && "text-success")}
                  aria-label={milestone.completedAt ? `Reopen ${milestone.title}` : `Complete ${milestone.title}`}
                  onClick={() => void patchMilestone(milestone, { completed: !milestone.completedAt })}
                >
                  {milestone.completedAt ? <Check size={15} /> : <Circle size={15} />}
                </button>
                {editingMilestoneId === milestone.id ? (
                  <Input
                    autoFocus
                    className="min-h-7 flex-1 rounded-none border-0 bg-transparent px-0 text-[12px] font-medium"
                    aria-label="Milestone title"
                    value={milestoneTitle}
                    onChange={(event) => setMilestoneTitle(event.target.value)}
                    onBlur={() => void commitMilestoneRename(milestone)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditingMilestoneId(null);
                    }}
                  />
                ) : (
                  <button id={`milestone-${milestone.id}`} type="button" className={cn("min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[12px] font-medium text-ink", milestone.completedAt && "text-muted")} onDoubleClick={() => beginMilestoneRename(milestone)} title="Double-click to rename">
                    {milestone.title}
                  </button>
                )}
                <span className="shrink-0 text-[9px] tabular-nums text-muted">{progress.done}/{progress.total}</span>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <IconButton className="!size-7 text-muted hover:text-accent" aria-label={`Rename ${milestone.title}`} title="Rename milestone" onClick={() => beginMilestoneRename(milestone)}><Pencil size={13} /></IconButton>
                  <IconButton className="!size-7 text-muted hover:text-danger" aria-label={`Delete ${milestone.title}`} title="Delete milestone" onClick={() => setDeleteTarget({ kind: "milestone", item: milestone })}><Trash2 size={13} /></IconButton>
                </div>
              </header>
              <div className="pt-1.5">
                {tasks.map((task) => <TaskRow key={task.id} task={task} activityBusy={activityBusy} onStartActivity={onStartActivity} onUpdate={patchTask} onDelete={(item) => setDeleteTarget({ kind: "task", item })} />)}
                {taskTarget?.milestoneId === milestone.id ? (
                  <InlineCreate placeholder="Task title" onCreate={(title) => addTask(title, milestone.id)} onCancel={() => setTaskTarget(null)} />
                ) : (
                  <Button variant="ghost" size="sm" className="mt-1 !min-h-8 gap-1 px-1.5 text-[10px] text-muted hover:text-accent" onClick={() => setTaskTarget({ milestoneId: milestone.id })}><Plus size={13} /> Add task</Button>
                )}
              </div>
            </section>
          );
        })}

        {addingMilestone && (
          <section className="border-b border-line pb-3">
            <InlineCreate placeholder="Milestone title" onCreate={addMilestone} onCancel={() => setAddingMilestone(false)} />
          </section>
        )}

        <section aria-labelledby="loose-tasks-title">
          <header className="flex min-h-8 items-center justify-between gap-2 border-b border-line pb-2">
            <div>
              <h3 id="loose-tasks-title" className="m-0 text-[11px] font-medium text-ink">Loose tasks</h3>
              <p className="mt-0.5 mb-0 text-[9px] text-muted">Actions that do not need a milestone.</p>
            </div>
          </header>
          <div className="pt-1.5">
            {looseTasks.map((task) => <TaskRow key={task.id} task={task} activityBusy={activityBusy} onStartActivity={onStartActivity} onUpdate={patchTask} onDelete={(item) => setDeleteTarget({ kind: "task", item })} />)}
            {taskTarget && !taskTarget.milestoneId ? (
              <InlineCreate placeholder="Task title" onCreate={(title) => addTask(title)} onCancel={() => setTaskTarget(null)} />
            ) : (
              <Button variant="ghost" size="sm" className="mt-1 !min-h-8 gap-1 px-1.5 text-[10px] text-muted hover:text-accent" onClick={() => setTaskTarget({})}><Plus size={13} /> Add task</Button>
            )}
          </div>
        </section>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogTitle>{deleteTarget?.kind === "milestone" ? "Delete this milestone?" : "Delete this task?"}</DialogTitle>
          <DialogDescription>
            {deleteTarget?.kind === "milestone"
              ? "Tasks inside it will stay in this workspace as loose tasks."
              : `“${deleteTarget?.item.title ?? "This task"}” will be removed from the plan.`}
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" disabled={deleting}>Cancel</Button></DialogClose>
            <Button variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
