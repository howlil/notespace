import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { FOCUS_TASK_COMPOSER_EVENT, PLANNING_TASK_CHANGED_EVENT } from "../../shared/browser/shell-events";
import { CalendarX2, CheckCircle2, Circle, Inbox as InboxIcon, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton, Input, cn } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import {
  deleteAnyTask,
  getToday,
  getAnyTask,
  updateAnyTask,
} from "../../adapters/http/planning-api";
import type { TodayProjection, TodayTask } from "../../domain/planning/planning";
import { useToast } from "../../shared/ui/toast-provider";
import { TaskComposer } from "./TaskComposer";
import { TaskWorkspaceAssign } from "./TaskWorkspaceAssign";
import { applyTodayTaskUpdate, removeFromTodayPatch } from "./projection-state";
import { reconcileTaskPatch } from "./task-mutation";

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
  onAssign,
}: {
  task: TodayTask;
  date: string;
  renderTaskAction?: (task: TodayTask) => ReactNode;
  onUpdate: (task: TodayTask, patch: { title?: string; completed?: boolean; plannedFor?: string }) => Promise<void>;
  onDelete: (task: TodayTask) => void;
  onAssign: (task: TodayTask) => void;
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
            className="mt-0.5 block w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted hover:text-accent"
          >
            {context || "Workspace task"}{carriedForward ? " · carried forward" : ""}
          </Link>
        ) : (
          <span className="mt-0.5 block text-[10px] text-muted">
            Needs Workspace{carriedForward ? " · carried forward" : ""}
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
              onClick={() => void onUpdate(task, removeFromTodayPatch())}
            >
              <CalendarX2 size={13} />
            </IconButton>
          )}
          {!task.workspaceId && <Button variant="ghost" size="sm" onClick={() => onAssign(task)} aria-label={`Move ${task.title} to Workspace`}>Move to Workspace</Button>}
          {!task.workspaceId && !task.completedAt && (
            <IconButton
              className="!size-7 text-muted hover:text-accent"
              aria-label={`Return ${task.title} to Capture Queue`}
              title="Return to Capture Queue"
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
  const taskInputRef = useRef<HTMLInputElement>(null);
  const routeHash = useRouterState({ select: state => state.location.hash });
  useEffect(() => {
    if (routeHash === "new-task" || routeHash === "#new-task") taskInputRef.current?.focus();
  }, [routeHash]);
  useEffect(() => {
    const onFocus = () => taskInputRef.current?.focus();
    window.addEventListener(FOCUS_TASK_COMPOSER_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_TASK_COMPOSER_EVENT, onFocus);
  }, []);

  const { showToast } = useToast();
  const [projection, setProjection] = useState(initial);
  const [assignTarget, setAssignTarget] = useState<TodayTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TodayTask | null>(null);

  const openTasks = useMemo(
    () => projection.tasks.filter((task) => !task.completedAt),
    [projection.tasks],
  );
  const completedTasks = useMemo(
    () => projection.tasks.filter((task) => Boolean(task.completedAt)),
    [projection.tasks],
  );

  // A late projection response must not overwrite a newer Task mutation.
  const mutationEpoch = useRef(0);
  const requestSequence = useRef(0);
  const pendingTaskIds = useRef(new Set<string>());
  const refreshToday = useCallback(async () => {
    const read = ++requestSequence.current;
    const epoch = mutationEpoch.current;
    try {
      const latest = await getToday(projection.date);
      if (read === requestSequence.current && epoch === mutationEpoch.current) setProjection(latest);
    } catch (error) {
      if (read !== requestSequence.current || epoch !== mutationEpoch.current) return;
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not refresh Today.",
      });
    }
  }, [projection.date, showToast]);

  useEffect(() => {
    // A delayed route-loader prop must not replace data changed by this view.
    // A real calendar-day change still swaps the target projection date.
    if (mutationEpoch.current !== 0 && initial.date === projection.date) {
      void refreshToday();
    } else {
      setProjection(initial);
    }
  }, [initial, projection.date, refreshToday]);

  useEffect(() => {
    // Route loaders can be cached on Back/Forward navigation. Re-read at mount.
    void refreshToday();
  }, [refreshToday]);

  useEffect(() => {
    if (refreshKey) void refreshToday();
  }, [refreshKey, refreshToday]);

  useEffect(() => {
    const onChange = () => { void refreshToday(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refreshToday(); };
    window.addEventListener(PLANNING_TASK_CHANGED_EVENT, onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PLANNING_TASK_CHANGED_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshToday]);

  async function patchTask(
    task: TodayTask,
    patch: { title?: string; completed?: boolean; plannedFor?: string },
  ) {
    if (pendingTaskIds.current.has(task.id)) return;
    pendingTaskIds.current.add(task.id);
    ++mutationEpoch.current;
    try {
      const outcome = await reconcileTaskPatch(
        task, patch,
        () => updateAnyTask(task.id, { ...patch, version: task.version }),
        getAnyTask,
      );
      if (outcome.status === "confirmed") {
        setProjection((current) => applyTodayTaskUpdate(current, outcome.task));
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
        return;
      }
      if (outcome.status === "conflict") {
        setProjection((current) => applyTodayTaskUpdate(current, outcome.task));
        showToast({ kind: "error", message: "Task changed elsewhere. Latest saved state was restored; retry your edit if needed." });
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
      } else if (outcome.status === "missing") {
        setProjection((current) => ({ ...current, tasks: current.tasks.filter((value) => value.id !== task.id) }));
        showToast({ kind: "error", message: "Task was deleted elsewhere. Today has been refreshed." });
        window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT));
      } else {
        showToast({ kind: "error", message: "Task update could not be confirmed. Check its status before retrying." });
      }
    } finally {
      pendingTaskIds.current.delete(task.id);
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

        <div className="mb-6 border-b border-line pb-4">
          <TaskComposer inputRef={taskInputRef} plannedFor={projection.date} titleLabel="New task"
            onCreated={async () => { ++mutationEpoch.current; await refreshToday(); window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT)); }} />
        </div>

        <section aria-labelledby="today-open-title">
          <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
            <h2 id="today-open-title" className="m-0 text-[11px] font-semibold text-ink">Now</h2>
            <span className="text-[10px] tabular-nums text-muted">{openTasks.length}</span>
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
                  onAssign={setAssignTarget}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-[150px] place-items-center border-b border-line text-center">
              <div>
                <p className="m-0 text-[12px] font-medium text-ink">Nothing queued for today.</p>
                <p className="mt-1.5 mb-0 text-[10px] text-muted">
                  Add a Workspace-owned task or choose one from a Workspace Plan.
                </p>
              </div>
            </div>
          )}
        </section>

        {completedTasks.length > 0 && (
          <section className="mt-6" aria-labelledby="today-done-title">
            <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
              <h2 id="today-done-title" className="m-0 text-[11px] font-medium text-muted">Done</h2>
              <span className="text-[10px] tabular-nums text-muted">{completedTasks.length}</span>
            </div>
            {completedTasks.map((task) => (
              <TodayTaskRow
                key={task.id}
                task={task}
                date={projection.date}
                renderTaskAction={renderTaskAction}
                onUpdate={patchTask}
                onDelete={setDeleteTarget}
                onAssign={setAssignTarget}
              />
            ))}
          </section>
        )}
      </div>

      <TaskWorkspaceAssign task={assignTarget} onClose={() => setAssignTarget(null)}
        onAssigned={async () => { ++mutationEpoch.current; await refreshToday(); window.dispatchEvent(new Event(PLANNING_TASK_CHANGED_EVENT)); }} />
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
