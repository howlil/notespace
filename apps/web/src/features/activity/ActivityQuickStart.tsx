import { useState, type FormEvent } from "react";
import { Play } from "lucide-react";
import { Button, Input } from "../../shared/ui";
import type { ActivityType } from "../../adapters/http/activity-api";
import { formatDuration } from "./activity-timer";
import { useActivityRuntime } from "./activity-runtime-provider";

export function ActivityQuickStart() {
  const activity = useActivityRuntime();
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("other");

  function startStandaloneActivity(event: FormEvent) {
    event.preventDefault();
    const next = activityTitle.trim();
    if (!next || !activity.canStart) return;
    activity.start({ title: next, activityType });
    setActivityTitle("");
  }

  return (
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
          <Button
            size="sm"
            className="!min-h-8 px-3 text-[10px]"
            disabled={!activityTitle.trim() || !activity.canStart}
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
