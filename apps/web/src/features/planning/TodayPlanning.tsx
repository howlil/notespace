import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarX2, CheckCircle2, Circle, Inbox as InboxIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Input, cn } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import {
  createStandaloneTask,
  deleteAnyTask,
  getToday,
  updateAnyTask,
} from "../../adapters/http/planning-api";
import type { TodayProjection, TodayTask } from "../../domain/planning/planning";
import { useToast } from "../../shared/ui/toast-provider";
import { applyTodayTaskUpdate } from "./projection-state";

function displayDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function TodayTaskRow({
  task,
  date,
  renderTaskAction,
  onUpdate,
  onDelete,
}: {
  task: TodayTask;
  date: string;
  renderTaskAction?: (task: TodayTask) => ReactNode;
  onUpdate: (task: TodayTask, patch: { title?: string; completed?: boolean; plannedFor?: string }) => Promise<void>;
  onDelete: (task: TodayTask) => void;
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

  const context = [task.workspaceTitle, task.milestoneTitle].filter(Boolean).join(" / ");
  const carriedForward = Boolean(task.plannedFor && task.plannedFor < date);

  return (
    <div className="group grid min-h-11 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line px-1 py-1.5">
      <button
        type="button"
        className={cn(
          "grid size-7 place-items-center rounded-md text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent",
          task.completedAt && "text-success",
        )}
        aria-label={task.completedAt ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        onClick={() => void onUpdate(task, { completed: !task.completedAt })}
      >
        {task.completedAt ? <CheckCircle2 size={17} /> : <Circle size={17} />}
      </button>

      <div className="min-w-0">
        {editing ? (
          <Input
            autoFocus
            className="min-h-7 w-full rounded-none border-0 bg-transparent px-0 text-[12px]"
            aria-label="Today task title"
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
            className={cn(
              "block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-left text-[12px] font-medium text-ink",
              task.completedAt && "text-muted line-through",
            )}
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {task.title}
          </button>
        )}

        {task.workspaceId ? (
          <Link
            to="/workspaces/$workspaceId"
            params={{ workspaceId: task.workspaceId }}
            className="mt-0.5 block w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-muted hover:text-accent"
          >
            {context || "Workspace task"}{carriedForward ? " · carried forward" : ""}
          </Link>
        ) : (
          <span className="mt-0.5 block text-[9px] text-muted">
            Standalone{carriedForward ? " · carried forward" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {!task.completedAt && renderTaskAction?.(task)}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton
            className="!size-7 text-muted hover:text-accent"
            aria-label={`Rename ${task.title}`}
            title="Rename task"
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} />
          </IconButton>
          {task.workspaceId && (
            <IconButton
              className="!size-7 text-muted hover:text-accent"
              aria-label={`Remove ${task.title} from Today`}
              title="Remove from Today"
              onClick={() => void onUpdate(task, { plannedFor: task.plannedFor === date ? "" : date })}
            >
              <CalendarX2 size={13} />
            </IconButton>
          )}
          {!task.workspaceId && !task.completedAt && (
            <IconButton
              className="!size-7 text-muted hover:text-accent"
              aria-label={`Move ${task.title} to Inbox`}
              title="Move to Inbox"
              onClick={() => void onUpdate(task, { plannedFor: "" })}
            >
              <InboxIcon size={13} />
            </IconButton>
          )}
          {!task.workspaceId && (
            <IconButton
              className="!size-7 text-muted hover:text-danger"
              aria-label={`Delete ${task.title}`}
              title="Delete task"
              onClick={() => onDelete(task)}
            >
              <Trash2 size={13} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function TodayPlanning({
  initial,
  refreshKey,
  renderActivity,
  renderTaskAction,
}: {
  initial: TodayProjection;
  refreshKey?: number;
  renderActivity?: ReactNode;
  renderTaskAction?: (task: TodayTask) => ReactNode;
}) {
  const { showToast } = useToast();
  const [projection, setProjection] = useState(initial);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TodayTask | null>(null);

  useEffect(() => {
    setProjection(initial);
  }, [initial]);

  const openTasks = useMemo(
    () => projection.tasks.filter((task) => !task.completedAt),
    [projection.tasks],
  );
  const completedTasks = useMemo(
    () => projection.tasks.filter((task) => Boolean(task.completedAt)),
    [projection.tasks],
  );

  useEffect(() => {
    if (!refreshKey) return;
    let cancelled = false;
    void getToday(projection.date)
      .then((latest) => {
        if (!cancelled) setProjection(latest);
      })
      .catch((error) => {
        if (!cancelled) {
          showToast({
            kind: "error",
            message: error instanceof Error ? error.message : "Could not refresh Today.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [projection.date, refreshKey, showToast]);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!next || creating) return;
    setCreating(true);
    try {
      const created = await createStandaloneTask(next, projection.date);
      setProjection((current) => ({
        ...current,
        tasks: [...current.tasks, created as TodayTask],
      }));
      setTitle("");
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not add task.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function patchTask(
    task: TodayTask,
    patch: { title?: string; completed?: boolean; plannedFor?: string },
  ) {
    try {
      const updated = await updateAnyTask(task.id, {
        ...patch,
        version: task.version,
      });
      setProjection((current) => applyTodayTaskUpdate(current, updated));
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
          <p className="m-0 text-[10px] font-medium uppercase tracking-[.12em] text-accent">
            {displayDate(projection.date)}
          </p>
          <h1 className="mt-2 mb-0 text-[28px] font-medium tracking-[-.7px] text-ink">Today</h1>
          <p className="mt-2 mb-0 text-[11px] text-muted">
            One place for the work you explicitly chose to do today.
          </p>
        </header>

        {renderActivity}

        <form className="mb-6 flex items-center gap-2 border-b border-line pb-4" onSubmit={addTask}>
          <Plus size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <Input
            className="min-h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-[12px] focus:border-transparent"
            aria-label="New standalone task"
            placeholder="Add something you need to do today"
            value={title}
            disabled={creating}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button size="sm" className="!min-h-8 px-3 text-[10px]" disabled={!title.trim() || creating}>
            {creating ? "Adding…" : "Add"}
          </Button>
        </form>

        <section aria-labelledby="today-open-title">
          <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
            <h2 id="today-open-title" className="m-0 text-[11px] font-semibold text-ink">Now</h2>
            <span className="text-[9px] tabular-nums text-muted">{openTasks.length}</span>
          </div>
          {openTasks.length ? (
            <div>
              {openTasks.map((task) => (
                <TodayTaskRow
                  key={task.id}
                  task={task}
                  date={projection.date}
                  renderTaskAction={renderTaskAction}
                  onUpdate={patchTask}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-[150px] place-items-center border-b border-line text-center">
              <div>
                <p className="m-0 text-[12px] font-medium text-ink">Nothing queued for today.</p>
                <p className="mt-1.5 mb-0 text-[10px] text-muted">
                  Add a standalone task here or pull a task from a workspace Plan.
                </p>
              </div>
            </div>
          )}
        </section>

        {completedTasks.length > 0 && (
          <section className="mt-6" aria-labelledby="today-done-title">
            <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
              <h2 id="today-done-title" className="m-0 text-[11px] font-medium text-muted">Done</h2>
              <span className="text-[9px] tabular-nums text-muted">{completedTasks.length}</span>
            </div>
            {completedTasks.map((task) => (
              <TodayTaskRow
                key={task.id}
                task={task}
                date={projection.date}
                renderTaskAction={renderTaskAction}
                onUpdate={patchTask}
                onDelete={setDeleteTarget}
              />
            ))}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this standalone task?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
