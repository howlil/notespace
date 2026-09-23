import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarPlus, Inbox as InboxIcon, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import { Button, IconButton, Input } from "../../shared/ui";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import type { CategorySummary } from "../../domain/workspace/workspace";
import { listCategories } from "../../adapters/http/workspace-api";
import {
  createStandaloneTask,
  deleteAnyTask,
  updateAnyTask,
} from "../../adapters/http/planning-api";
import {
  localDateKey,
  type InboxProjection,
  type PlanningTask,
} from "../../domain/planning/planning";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import { ThemeToggle } from "../../shared/ui/theme-provider";
import { useToast } from "../../shared/ui/toast-provider";

function InboxTaskRow({
  task,
  onUpdate,
  onDelete,
}: {
  task: PlanningTask;
  onUpdate: (task: PlanningTask, patch: { title?: string; plannedFor?: string }) => Promise<void>;
  onDelete: (task: PlanningTask) => void;
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

      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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

export function InboxPage({
  categories,
  initial,
}: {
  categories: CategorySummary[];
  initial: InboxProjection;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [projection, setProjection] = useState(initial);
  const [categoryItems, setCategoryItems] = useState(categories);

  useEffect(() => {
    setProjection(initial);
  }, [initial]);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlanningTask | null>(null);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!next || creating) return;
    setCreating(true);
    try {
      const created = await createStandaloneTask(next);
      setProjection((current) => ({
        ...current,
        tasks: [...current.tasks, created],
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
    task: PlanningTask,
    patch: { title?: string; plannedFor?: string },
  ) {
    try {
      const updated = await updateAnyTask(task.id, {
        ...patch,
        version: task.version,
      });
      setProjection((current) => ({
        ...current,
        tasks: updated.plannedFor
          ? current.tasks.filter((item) => item.id !== updated.id)
          : current.tasks.map((item) => item.id === updated.id ? updated : item),
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
      <LibrarySidebar
        categories={categoryItems}
        inboxActive
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
            <div className="flex items-center gap-2 text-accent">
              <InboxIcon size={15} aria-hidden="true" />
              <p className="m-0 text-[10px] font-medium uppercase tracking-[.12em]">Capture</p>
            </div>
            <h1 className="mt-2 mb-0 text-[28px] font-medium tracking-[-.7px] text-ink">
              Inbox
            </h1>
            <p className="mt-2 mb-0 text-[11px] text-muted">
              Capture first. Decide when to do it later.
            </p>
          </header>

          <form
            className="mb-6 flex items-center gap-2 border-b border-line pb-4"
            onSubmit={addTask}
          >
            <Plus size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <Input
              className="min-h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-[12px] focus:border-transparent"
              aria-label="New inbox task"
              placeholder="Capture something without scheduling it"
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

          <section aria-labelledby="inbox-open-title">
            <div className="flex min-h-8 items-center justify-between border-b border-line pb-2">
              <h2 id="inbox-open-title" className="m-0 text-[11px] font-semibold text-ink">
                Unscheduled
              </h2>
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
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-h-[150px] place-items-center border-b border-line text-center">
                <div>
                  <p className="m-0 text-[12px] font-medium text-ink">Inbox clear.</p>
                  <p className="mt-1.5 mb-0 text-[10px] text-muted">
                    Capture something when it appears. Scheduling can wait.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this inbox task?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed.` : ""}
        confirmLabel="Delete"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
