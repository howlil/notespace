import { useEffect, useState } from "react";
import { CalendarPlus, Inbox as InboxIcon, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton, Input } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import {
  deleteAnyTask,
  updateAnyTask,
} from "../../adapters/http/planning-api";
import {
  localDateKey,
  type InboxProjection,
  type PlanningTask,
} from "../../domain/planning/planning";
import { useToast } from "../../shared/ui/toast-provider";
import { applyInboxTaskUpdate } from "./projection-state";
import { LegacyTaskAssign } from "./LegacyTaskAssign";

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
            aria-label="Inbox task title"
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
        <span className="mt-0.5 block text-[9px] text-muted">Standalone · not scheduled</span>
      </div>

      <div className="flex items-center gap-0.5 group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" className="rounded-md px-2 py-1 text-[10px] text-accent hover:bg-tint" onClick={() => onAssign(task)} aria-label={`Assign ${task.title} to Workspace`}>Assign</button>
        <IconButton
          className="!size-7 text-muted hover:text-accent"
          aria-label={`Move ${task.title} to Today`}
          title="Move to Today"
          onClick={() => void onUpdate(task, { plannedFor: localDateKey() })}
        >
          <CalendarPlus size={13} />
        </IconButton>
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

export function InboxPlanning({ initial }: { initial: InboxProjection }) {
  const { showToast } = useToast();
  const [projection, setProjection] = useState(initial);
  const [assignTarget, setAssignTarget] = useState<PlanningTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanningTask | null>(null);

  useEffect(() => {
    setProjection(initial);
  }, [initial]);

  async function patchTask(
    task: PlanningTask,
    patch: { title?: string; plannedFor?: string },
  ) {
    try {
      const updated = await updateAnyTask(task.id, {
        ...patch,
        version: task.version,
      });
      setProjection((current) => applyInboxTaskUpdate(current, updated));
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not update task.",
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteAnyTask(target.id, target.version);
      setProjection((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== target.id),
      }));
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not delete task.",
      });
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[820px] px-6 pt-8 pb-12 max-[800px]:px-5 max-[560px]:p-4 max-[560px]:pt-5">
        <header className="mb-6 border-b border-line pb-4">
          <div className="flex items-center gap-2 text-accent">
            <InboxIcon size={15} aria-hidden="true" />
            <p className="m-0 text-[10px] font-medium uppercase tracking-[.12em]">Capture</p>
          </div>
          <h1 className="mt-2 mb-0 text-[28px] font-medium tracking-[-.7px] text-ink">Legacy Inbox tasks</h1>
          <p className="mt-2 mb-0 text-[11px] text-muted">
            Existing standalone tasks remain here until you explicitly assign each one to a Workspace. For new ideas, use Capture Queue above.
          </p>
        </header>



        <section aria-labelledby="inbox-open-title">
          <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
            <h2 id="inbox-open-title" className="m-0 text-[11px] font-semibold text-ink">Unscheduled</h2>
            <span className="text-[9px] tabular-nums text-muted">{projection.tasks.length}</span>
          </div>

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
                <p className="m-0 text-[12px] font-medium text-ink">Inbox clear.</p>
                <p className="mt-1.5 mb-0 text-[10px] text-muted">
                  No legacy tasks remain. Use Capture Queue for new unorganized work.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <LegacyTaskAssign task={assignTarget} onClose={() => setAssignTarget(null)}
        onAssigned={(updated) => { setProjection((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== updated.id) })); }} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this inbox task?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
