import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarX2, CheckCircle2, Circle, Pause, Pencil, Play, Plus, Search, Square, Trash2 } from "lucide-react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Button, IconButton, Input, cn } from "../../components/ui";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import type { CategorySummary } from "../../domain/project/project";
import { listCategories } from "../../domain/project/api";
import {
  createStandaloneTask,
  deleteAnyTask,
  updateAnyTask,
} from "../../domain/planning/api";
import type {
  TodayProjection,
  TodayTask,
} from "../../domain/planning/planning";
import { OPEN_QUICK_SEARCH_EVENT } from "../search/quick-search-events";
import { ThemeToggle } from "../../providers/theme-provider";
import { useActivitySession } from "../study/use-study-session";
import { formatDuration } from "../study/study-timer";
import type { ActivityType } from "../../domain/activity/api";
import { useToast } from "../../providers/toast-provider";
import { ActivityTypeTrigger } from "../study/ActivityTypeTrigger";

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
  activityBusy,
  onStart,
  onUpdate,
  onDelete,
}: {
  task: TodayTask;
  date: string;
  activityBusy: boolean;
  onStart: (task: TodayTask, activityType: ActivityType) => void;
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
          <span className="mt-0.5 block text-[9px] text-muted">Standalone{carriedForward ? " · carried forward" : ""}</span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {!task.completedAt && (
          <ActivityTypeTrigger
            ariaLabel={`Start activity for ${task.title}`}
            disabled={activityBusy}
            onSelect={(nextActivityType) => onStart(task, nextActivityType)}
          />
        )}
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

export function Today({
  categories,
  initial,
}: {
  categories: CategorySummary[];
  initial: TodayProjection;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [projection, setProjection] = useState(initial);
  const [categoryItems, setCategoryItems] = useState(categories);
  const activity = useActivitySession();
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("other");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TodayTask | null>(null);
  const [handoffTaskId, setHandoffTaskId] = useState<string | null>(null);

  const openTasks = useMemo(
    () => projection.tasks.filter((task) => !task.completedAt),
    [projection.tasks],
  );
  const completedTasks = useMemo(
    () => projection.tasks.filter((task) => Boolean(task.completedAt)),
    [projection.tasks],
  );
  const handoffTask = useMemo(
    () => handoffTaskId
      ? projection.tasks.find((task) => task.id === handoffTaskId && !task.completedAt) ?? null
      : null,
    [handoffTaskId, projection.tasks],
  );

  function startStandaloneActivity(event: FormEvent) {
    event.preventDefault();
    const next = activityTitle.trim();
    if (!next || !activity.canStart || handoffTask) return;
    activity.start({ title: next, activityType });
    setActivityTitle("");
  }

  function startTaskActivity(task: TodayTask, taskActivityType: ActivityType) {
    if (!activity.canStart || handoffTask) return;
    activity.start({
      title: task.title,
      activityType: taskActivityType,
      taskId: task.id,
      taskTitleSnapshot: task.title,
      ...(task.workspaceId ? { workspaceId: task.workspaceId } : {}),
      ...(task.workspaceTitle ? { workspaceTitleSnapshot: task.workspaceTitle } : {}),
    });
  }

  function endActivity() {
    const taskId = activity.activeContext?.taskId;
    const task = taskId
      ? projection.tasks.find((item) => item.id === taskId && !item.completedAt)
      : undefined;
    activity.end();
    setHandoffTaskId(task?.id ?? null);
  }

  async function completeHandoffTask() {
    if (!handoffTask) return;
    const target = handoffTask;
    try {
      const updated = await updateAnyTask(target.id, {
        completed: true,
        version: target.version,
      });
      setProjection((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item),
      }));
      setHandoffTaskId(null);
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not complete task.",
      });
    }
  }

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
      setProjection((current) => ({
        ...current,
        tasks:
          updated.plannedFor === current.date
            ? current.tasks.map((item) =>
                item.id === updated.id
                  ? { ...item, ...updated }
                  : item,
              )
            : current.tasks.filter((item) => item.id !== updated.id),
      }));
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
    <div className="grid min-h-dvh grid-cols-[minmax(0,224px)_minmax(0,1fr)] bg-background max-[560px]:grid-cols-[minmax(0,1fr)]">
      <Sidebar
        categories={categoryItems}
        todayActive
        onChanged={() => {
          void listCategories()
            .then(setCategoryItems)
            .catch((error) => showToast({
              kind: "error",
              message: error instanceof Error ? error.message : "Could not refresh categories.",
            }));
        }}
        onSelectCategory={(categoryId) => {
          void navigate({
            to: "/categories/$categoryId",
            params: { categoryId },
          });
        }}
      />

      <main className="min-h-dvh min-w-0 max-[560px]:min-h-0">
        <header className="relative z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 max-[560px]:gap-2 max-[560px]:px-3">
          <button
            type="button"
            className="flex min-h-9 w-[min(320px,42vw)] min-w-[190px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-left text-ink/70 transition-colors hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[560px]:min-h-8 max-[560px]:w-full max-[560px]:min-w-0"
            aria-label="Search Notespace with Control K or Command K"
            onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}
          >
            <Search size={15} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
              Search Notespace
            </span>
            <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink/60">
              Ctrl/⌘ K
            </kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1 [&>button]:size-[30px]">
            <ThemeToggle />
          </div>
        </header>

        <div className="mx-auto w-full max-w-[820px] px-6 pt-8 pb-12 max-[800px]:px-5 max-[560px]:p-4 max-[560px]:pt-5">
          <header className="mb-6 border-b border-line pb-4">
            <p className="m-0 text-[10px] font-medium uppercase tracking-[.12em] text-accent">
              {displayDate(projection.date)}
            </p>
            <h1 className="mt-2 mb-0 text-[28px] font-medium tracking-[-.7px] text-ink">
              Today
            </h1>
            <p className="mt-2 mb-0 text-[11px] text-muted">
              One place for the work you explicitly chose to do today.
            </p>
          </header>

          <section className="mb-6 border-b border-line pb-4" aria-labelledby="today-activity-title">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 id="today-activity-title" className="m-0 text-[11px] font-semibold text-ink">Activity</h2>
                <p className="mt-0.5 mb-0 text-[9px] text-muted">Start first. Context is optional.</p>
              </div>
              <span className="text-[10px] tabular-nums text-muted">
                {formatDuration(activity.todaySeconds)} today
              </span>
            </div>

            {activity.status === "idle" ? (
              <form className="flex items-center gap-2" onSubmit={startStandaloneActivity}>
                <Play size={15} className="shrink-0 text-muted" aria-hidden="true" />
                <Input
                  className="min-h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-[12px] focus:border-transparent"
                  aria-label="Quick activity"
                  placeholder="What are you doing?"
                  value={activityTitle}
                  disabled={!activity.ready || !activity.canStart || Boolean(handoffTask)}
                  onChange={(event) => setActivityTitle(event.target.value)}
                />
                <select
                  className="min-h-8 rounded-md border border-line bg-surface px-2 text-[10px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label="Activity type"
                  value={activityType}
                  disabled={!activity.ready || !activity.canStart || Boolean(handoffTask)}
                  onChange={(event) => setActivityType(event.target.value as ActivityType)}
                >
                  <option value="other">Other</option>
                  <option value="build">Build</option>
                  <option value="learn">Learn</option>
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                  <option value="exercise">Exercise</option>
                </select>
                <Button
                  size="sm"
                  className="!min-h-8 px-3 text-[10px]"
                  disabled={!activityTitle.trim() || !activity.canStart || Boolean(handoffTask)}
                >
                  Start
                </Button>
              </form>
            ) : (
              <div className="flex min-h-10 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-ink">
                    {activity.activeContext?.title ?? "Activity"}
                  </div>
                  <div className="mt-0.5 text-[9px] capitalize text-muted">
                    {activity.activeContext?.activityType ?? "other"} · {formatDuration(activity.currentSeconds)}
                  </div>
                </div>
                <IconButton
                  className="!size-8 text-muted hover:text-accent"
                  aria-label={activity.status === "running" ? "Pause activity" : "Resume activity"}
                  title={activity.status === "running" ? "Pause" : "Resume"}
                  onClick={activity.status === "running" ? activity.pause : activity.resume}
                >
                  {activity.status === "running" ? <Pause size={15} /> : <Play size={15} />}
                </IconButton>
                <IconButton
                  className="!size-8 text-muted hover:text-danger"
                  aria-label="End activity"
                  title="End activity"
                  onClick={endActivity}
                >
                  <Square size={14} />
                </IconButton>
              </div>
            )}

            {handoffTask && activity.status === "idle" && (
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3" role="status" aria-label="Task completion handoff">
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
                  Finished activity for <strong className="font-medium text-ink">{handoffTask.title}</strong>. Mark task done?
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="!min-h-7 px-2.5 text-[10px]"
                  onClick={() => void completeHandoffTask()}
                >
                  Mark done
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="!min-h-7 px-2 text-[10px] text-muted"
                  onClick={() => setHandoffTaskId(null)}
                >
                  Keep open
                </Button>
              </div>
            )}
          </section>

          <form
            className="mb-6 flex items-center gap-2 border-b border-line pb-4"
            onSubmit={addTask}
          >
            <Plus size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <Input
              className="min-h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-[12px] focus:border-transparent"
              aria-label="New standalone task"
              placeholder="Add something you need to do today"
              value={title}
              disabled={creating}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button
              size="sm"
              className="!min-h-8 px-3 text-[10px]"
              disabled={!title.trim() || creating}
            >
              {creating ? "Adding…" : "Add"}
            </Button>
          </form>

          <section aria-labelledby="today-open-title">
            <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
              <h2 id="today-open-title" className="m-0 text-[11px] font-semibold text-ink">
                Now
              </h2>
              <span className="text-[9px] tabular-nums text-muted">{openTasks.length}</span>
            </div>
            {openTasks.length ? (
              <div>
                {openTasks.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    date={projection.date}
                    activityBusy={activity.status !== "idle" || !activity.canStart || Boolean(handoffTask)}
                    onStart={startTaskActivity}
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
                <h2 id="today-done-title" className="m-0 text-[11px] font-medium text-muted">
                  Done
                </h2>
                <span className="text-[9px] tabular-nums text-muted">{completedTasks.length}</span>
              </div>
              {completedTasks.map((task) => (
                <TodayTaskRow
                  key={task.id}
                  task={task}
                  date={projection.date}
                  activityBusy={activity.status !== "idle" || !activity.canStart || Boolean(handoffTask)}
                  onStart={startTaskActivity}
                  onUpdate={patchTask}
                  onDelete={setDeleteTarget}
                />
              ))}
            </section>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this standalone task?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
