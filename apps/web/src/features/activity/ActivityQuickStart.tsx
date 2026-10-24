import { useState, type FormEvent } from "react";
import { getWorkspace } from "../../adapters/http/workspace-api";
import { useToast } from "../../shared/ui/toast-provider";
import { useActivityWorkspaceChoices } from "./activity-workspaces";
import { Play } from "lucide-react";
import { Button, Input } from "../../shared/ui";
import type { ActivityType } from "../../adapters/http/activity-api";
import { formatDuration } from "./activity-timer";
import { useActivityRuntime } from "./activity-runtime-provider";

export function ActivityQuickStart() {
  const activity = useActivityRuntime();
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("other");
  const [workspaceId, setWorkspaceId] = useState("");
  const [starting, setStarting] = useState(false);
  const { showToast } = useToast();
  const workspaces = useActivityWorkspaceChoices(activity.status === "idle");

  async function startWorkspaceActivity(event: FormEvent) {
    event.preventDefault();
    const title = activityTitle.trim();
    if (!title || !workspaceId || starting || !activity.canStart) return;
    setStarting(true);
    try {
      // A deleted/moved Workspace cannot become an orphaned new timer context.
      const workspace = await getWorkspace(workspaceId);
      if (!activity.canStart) return;
      activity.start({
        title,
        activityType,
        workspaceId: workspace.id,
        workspaceTitleSnapshot: workspace.title,
      });
      setActivityTitle("");
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Workspace could not be verified for this activity." });
      workspaces.retry();
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="mb-6 border-b border-line pb-4" aria-labelledby="today-activity-title">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 id="today-activity-title" className="m-0 text-[11px] font-semibold text-ink">Activity</h2>
          <p className="mt-0.5 mb-0 text-[9px] text-muted">Start in a Workspace. The global timer stays available.</p>
        </div>
        <span className="text-[10px] tabular-nums text-muted">
          {formatDuration(activity.todaySeconds)} today
        </span>
      </div>

      {activity.status === "idle" ? (
        <form className="flex items-center gap-2" onSubmit={(event) => { void startWorkspaceActivity(event); }}>
          <Play size={15} className="shrink-0 text-muted" aria-hidden="true" />
          <Input
            className="min-h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-[12px] focus:border-transparent"
            aria-label="Quick activity"
            placeholder="What are you doing?"
            value={activityTitle}
            disabled={!activity.ready || !activity.canStart}
            onChange={(event) => setActivityTitle(event.target.value)}
          />
          <select
            className="min-h-8 rounded-md border border-line bg-surface px-2 text-[10px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Activity type"
            value={activityType}
            disabled={!activity.ready || !activity.canStart}
            onChange={(event) => setActivityType(event.target.value as ActivityType)}
          >
            <option value="other">Other</option>
            <option value="build">Build</option>
            <option value="learn">Learn</option>
            <option value="read">Read</option>
            <option value="write">Write</option>
            <option value="exercise">Exercise</option>
          </select>
          <select
            aria-label="Activity Workspace"
            className="min-h-8 min-w-0 max-w-[190px] rounded-md border border-line bg-surface px-2 text-[10px] text-ink"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            disabled={!activity.canStart || starting || workspaces.loading || workspaces.error}
          >
            <option value="">{workspaces.loading ? "Loading…" : "Choose Workspace…"}</option>
            {workspaces.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          {workspaces.error && <Button type="button" variant="secondary" size="sm" onClick={workspaces.retry}>Retry Workspaces</Button>}
          <Button
            size="sm"
            className="!min-h-8 px-3 text-[10px]"
            disabled={!activityTitle.trim() || !workspaceId || !activity.canStart || starting || workspaces.loading || workspaces.error}
          >
            Start
          </Button>
        </form>
      ) : (
        <div className="flex min-h-10 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-ink">Activity in progress</div>
            <div className="mt-0.5 text-[9px] text-muted">
              {formatDuration(activity.currentSeconds)} · Controls stay available in the activity dock.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
