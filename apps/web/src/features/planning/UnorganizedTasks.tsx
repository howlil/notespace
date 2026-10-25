import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarPlus, Inbox as InboxIcon, Pencil, Trash2 } from "lucide-react";
import { IconButton, Input } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import {
  deleteAnyTask,
  getAnyTask,
  getUnassignedTasks,
  updateAnyTask,
} from "../../adapters/http/planning-api";
import {
  localDateKey,
  type InboxProjection,
  type PlanningTask,
} from "../../domain/planning/planning";
import { useToast } from "../../shared/ui/toast-provider";
import { applyUnassignedTaskUpdate } from "./projection-state";
import { reconcileTaskDelete, reconcileTaskPatch } from "./task-mutation";
import { TaskWorkspaceAssign } from "./TaskWorkspaceAssign";
import { PLANNING_TASK_CHANGED_EVENT } from "../../shared/browser/shell-events";

function InboxTaskRow({
  task,
  onUpdate,
  onDelete,
  onAssign,
}: {
  task: PlanningTask;
  onUpdate: (task: PlanningTask, patch: { title?: string; plannedFor?: string }) => Promise<void>;
  onDelete: (task: PlanningTask) => void;
  onAssign: (task: PlanningTask) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [saving, setSaving] = useState(false);

  useEffect(() => setTitle(task.title), [task.title]);

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
    <div className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-line px-1 py-1.5">
      <div className="min-w-0">
        {editing ? (
          <Input
            autoFocus
            className="min-h-7 w-full rounded-none border-0 bg-transparent px-0 text-[12px]"
            aria-label="Task title"
            value={title}
            disabled={saving}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(task.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-left text-[12px] font-medium text-ink"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {task.title}
          </button>
        )}
        <span className="mt-0.5 block text-[9px] text-muted">Needs Workspace · {task.completedAt ? "Completed" : task.plannedFor ? `Scheduled for ${task.plannedFor}` : "Not scheduled"}</span>
      </div>

      <div className="flex items-center gap-0.5 group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" className="rounded-md px-2 py-1 text-[10px] text-accent hover:bg-tint" onClick={() => onAssign(task)} aria-label={`Move ${task.title} to Workspace`}>Move</button>
        {!task.completedAt && !task.plannedFor && <IconButton
          className="!size-7 text-muted hover:text-accent"
          aria-label={`Move ${task.title} to Today`}
          title="Move to Today"
          onClick={() => void onUpdate(task, { plannedFor: localDateKey() })}
        >
          <CalendarPlus size={13} />
        </IconButton>}
        <IconButton
          className="!size-7 text-muted hover:text-accent"
          aria-label={`Rename ${task.title}`}
          title="Rename task"
          onClick={() => setEditing(true)}
        >
          <Pencil size={13} />
        </IconButton>
        <IconButton
          className="!size-7 text-muted hover:text-danger"
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          onClick={() => onDelete(task)}
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}

export function UnorganizedTasks({ initial }: { initial: InboxProjection }) {
  const { showToast } = useToast();
  const [projection, setProjection] = useState(initial);
  const [assignTarget, setAssignTarget] = useState<PlanningTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanningTask | null>(null);


  const [readError, setReadError] = useState(false);
  const mutationEpoch = useRef(0);
  const requestSequence = useRef(0);
  const pendingTaskIds = useRef(new Set<string>());

  const refreshTasks = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const epoch = mutationEpoch.current;
    try {
      const latest = await getUnassignedTasks();
      if (sequence === requestSequence.current && epoch === mutationEpoch.current) {
        setProjection(latest);
        setReadError(false);
      }
    } catch {
      if (sequence === requestSequence.current && epoch === mutationEpoch.current) {
        setReadError(true);
        showToast({ kind: "error", message: "Could not refresh tasks to organize." });
      }
    }
  }, [showToast]);

  useEffect(() => {
    void refreshTasks();
    const onChange = () => { void refreshTasks(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refreshTasks(); };
    window.addEventListener(PLANNING_TASK_CHANGED_EVENT, onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PLANNING_TASK_CHANGED_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshTasks]);

  async function patchTask(task: PlanningTask, patch: { title?: string; plannedFor?: string }) {
    if (pendingTaskIds.current.has(task.id)) return;
    pendingTaskIds.current.add(task.id);
    ++mutationEpoch.current;
    try {
      const result = await reconcileTaskPatch(
        task, patch, () => updateAnyTask(task.id, { ...patch, version: task.version }), getAnyTask,
      );
      if (result.status === "confirmed") {
        setProjection((current) => applyUnassignedTaskUpdate(current, result.task));
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
      } else if (result.status === "conflict") {
        setProjection((current) => applyUnassignedTaskUpdate(current, result.task));
        showToast({ kind: "error", message: "Task changed elsewhere. Latest state restored; retry if needed." });
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
      } else if (result.status === "missing") {
        setProjection((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }));
        showToast({ kind: "error", message: "Task was removed elsewhere. List refreshed." });
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
      } else {
        showToast({ kind: "error", message: "Task update not confirmed. Refresh before retrying." });
        void refreshTasks();
      }
    } finally {
      pendingTaskIds.current.delete(task.id);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || pendingTaskIds.current.has(deleteTarget.id)) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    pendingTaskIds.current.add(target.id);
    ++mutationEpoch.current;
    try {
      const result = await reconcileTaskDelete(
        target.id, () => deleteAnyTask(target.id, target.version), getAnyTask,
      );
      if (result.status === "confirmed") {
        setProjection((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== target.id) }));
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
      } else if (result.status === "exists") {
        setProjection((current) => applyUnassignedTaskUpdate(current, result.task));
        showToast({ kind: "error", message: "Task was not deleted. Latest saved state is shown." });
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
      } else {
        showToast({ kind: "error", message: "Delete not confirmed. Refresh before trying again." });
        void refreshTasks();
      }
    } finally {
      pendingTaskIds.current.delete(target.id);
    }
  }

  if (projection.tasks.length === 0 && !readError) return null;

  return (
    <>
      <div className="mx-auto w-full max-w-[820px] px-6 pt-6 pb-12 max-[800px]:px-5 max-[560px]:px-4">
        <header className="mb-4 border-b border-line pb-3">
          <div className="flex items-center gap-2 text-accent">
            <InboxIcon size={15} aria-hidden="true" />
            <p className="m-0 text-[10px] font-medium uppercase tracking-[.12em]">Workspace assignment</p>
          </div>
          <h2 className="mt-2 mb-0 text-[16px] font-medium tracking-[-.2px] text-ink">Tasks to organize</h2>
          <p className="mt-2 mb-0 text-[11px] text-muted">
            These existing tasks need a Workspace. Moving a task preserves its history, date, and completion state.
          </p>
        </header>


        <section aria-labelledby="inbox-open-title">
          <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
            <h2 id="inbox-open-title" className="m-0 text-[11px] font-semibold text-ink">Awaiting Workspace</h2>
            <span className="text-[9px] tabular-nums text-muted">{projection.tasks.length}</span>
          </div>

          {readError && <p role="alert" className="py-2 text-[11px] text-danger">Task list may be outdated. <button type="button" className="underline" onClick={() => void refreshTasks()}>Retry</button></p>}
          {projection.tasks.length ? (
            <div>
              {projection.tasks.map((task) => (
                <InboxTaskRow
                  key={task.id}
                  task={task}
                  onUpdate={patchTask}
                  onDelete={setDeleteTarget}
                  onAssign={setAssignTarget}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-[150px] place-items-center border-b border-line text-center">
              <div>
                <p className="m-0 text-[12px] font-medium text-ink">Nothing to organize.</p>
                <p className="mt-1.5 mb-0 text-[10px] text-muted">
                  All existing tasks have a Workspace. Capture new ideas above.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <TaskWorkspaceAssign task={assignTarget} onClose={() => setAssignTarget(null)}
        onAssigned={(updated) => { ++mutationEpoch.current; setProjection((current) => applyUnassignedTaskUpdate(current, updated)); window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT)); }} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this task?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
