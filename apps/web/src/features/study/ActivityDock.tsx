import { Loader2, Pause, Play, Square } from "lucide-react";
import { Button, IconButton, cn } from "../../components/ui";
import { formatDuration } from "./study-timer";
import { useActivityRuntime } from "./activity-runtime-provider";

const dockClass = "fixed right-1/2 bottom-[max(16px,env(safe-area-inset-bottom))] z-[180] w-[min(520px,calc(100vw_-_32px))] translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-[0_12px_32px_#0002] max-[560px]:bottom-[max(12px,env(safe-area-inset-bottom))] max-[560px]:w-[calc(100vw_-_24px)]";

export function ActivityDock() {
  const activity = useActivityRuntime();
  const active = activity.status !== "idle";

  if (
    !active
    && activity.finalizingCount === 0
    && !activity.handoffResolving
    && !activity.handoffTask
  ) return null;

  return (
    <section className={dockClass} aria-label="Activity dock">
      {active && (
        <div
          className="flex items-center gap-2.5"
          role="status"
          aria-label="Active activity"
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              activity.status === "running" ? "bg-success" : "bg-muted",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-ink">
              {activity.activeContext?.title ?? "Activity"}
            </div>
            <div className="mt-0.5 text-[9px] capitalize text-muted">
              {activity.activeContext?.activityType ?? "other"} · {formatDuration(activity.currentSeconds)}
            </div>
          </div>
          <IconButton
            type="button"
            className="!size-8 text-muted hover:text-accent"
            aria-label={activity.status === "running" ? "Pause activity" : "Resume activity"}
            title={activity.status === "running" ? "Pause" : "Resume"}
            onClick={activity.status === "running" ? activity.pause : activity.resume}
          >
            {activity.status === "running" ? <Pause size={15} /> : <Play size={15} />}
          </IconButton>
          <IconButton
            type="button"
            className="!size-8 text-muted hover:text-danger"
            aria-label="End activity"
            title="End activity"
            onClick={activity.end}
          >
            <Square size={14} />
          </IconButton>
        </div>
      )}

      {activity.finalizingCount > 0 && (
        <div
          className={cn(
            "flex min-h-7 items-center gap-2 text-[9px] text-muted",
            active && "mt-2 border-t border-line pt-2",
          )}
          role="status"
          aria-label="Activity sync"
        >
          Saved locally · finalizing when connection is available.
        </div>
      )}

      {activity.handoffResolving && (
        <div
          className={cn(
            "flex min-h-8 items-center gap-2 text-[11px] text-muted",
            (active || activity.finalizingCount > 0) && "mt-2 border-t border-line pt-2",
          )}
          role="status"
          aria-label="Activity task handoff"
        >
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Checking the latest task state…
        </div>
      )}

      {activity.handoffTask && !activity.handoffResolving && (
        <div
          className={cn(
            "flex items-center gap-3",
            (active || activity.finalizingCount > 0) && "mt-2 border-t border-line pt-2",
          )}
          role="status"
          aria-label="Task completion handoff"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-medium uppercase tracking-[.08em] text-muted">Activity ended</div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-ink">{activity.handoffTask.title}</div>
            <div className="mt-0.5 text-[9px] text-muted">Mark task done?</div>
          </div>
          <Button
            type="button"
            size="sm"
            className="!min-h-7 shrink-0 px-2.5 text-[10px]"
            disabled={activity.handoffBusy}
            onClick={() => void activity.completeHandoffTask()}
          >
            Mark done
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="!min-h-7 shrink-0 px-2 text-[10px] text-muted"
            disabled={activity.handoffBusy}
            onClick={activity.keepHandoffTaskOpen}
          >
            Keep open
          </Button>
        </div>
      )}
    </section>
  );
}
