import { Play, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton, PopupSurface, Skeleton, cn } from "../../shared/ui";
import {
  listActivitySessions,
  type ActivitySession,
} from "../../adapters/http/activity-api";
import { useDismissablePopup } from "../../shared/ui/dismissable";
import { useToast } from "../../shared/ui/toast-provider";
import type { ActivitySessionState } from "./use-activity-session";
import { formatDay, formatDuration } from "./activity-timer";
import { ActivityTypeMenu } from "./ActivityTypeMenu";

const timerActionClass = "!size-10 !min-h-10 shrink-0 p-0 text-muted hover:text-accent focus-visible:bg-tint focus-visible:text-accent";

function sessionTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ActivityIndicator({
  activity,
  workspaceId,
  workspaceTitle,
}: {
  activity: ActivitySessionState;
  workspaceId: string;
  workspaceTitle: string;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => {
    setOpen(false);
    setStartOpen(false);
  }, []);
  useDismissablePopup(indicatorRef, open || startOpen, dismiss);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSessionsLoading(true);
    setSessionsError(null);
    void listActivitySessions(20)
      .then((items) => { if (active) setSessions(items); })
      .catch((error) => {
        if (!active) return;
        setSessions([]);
        setSessionsError(error instanceof Error ? error.message : "Could not load activity sessions.");
      })
      .finally(() => { if (active) setSessionsLoading(false); });
    return () => { active = false; };
  }, [open, activity.status]);

  async function removeSession(session: ActivitySession) {
    if (activity.status !== "idle" || deletingSessionId) return;
    setDeletingSessionId(session.id);
    try {
      await activity.deleteSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      showToast({ kind: "success", message: "Activity session deleted." });
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not delete this activity session.",
      });
    } finally {
      setDeletingSessionId(null);
    }
  }

  const state = activity.status === "running"
    ? "Running"
    : activity.status === "paused"
      ? "Paused"
      : "No active activity";

  return (
    <div ref={indicatorRef} className="relative flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-8 gap-1.5 px-2 py-1 text-[11px] text-muted hover:text-ink focus-visible:bg-tint focus-visible:text-ink"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Activity, today ${formatDuration(activity.todaySeconds)}`}
        onClick={() => {
          setStartOpen(false);
          setOpen((value) => !value);
        }}
      >
        <span className={cn(
          "text-[10px] leading-none not-italic",
          activity.status === "running" ? "text-success" : "text-muted",
        )}>●</span>
        {formatDuration(activity.todaySeconds)}
      </Button>

      {activity.status === "idle" && (
        <Button
          variant="secondary"
          size="sm"
          className={timerActionClass}
          disabled={!activity.ready || !activity.canStart}
          aria-label="Start activity"
          aria-haspopup="menu"
          aria-expanded={startOpen}
          title={activity.blockedByOtherTab ? "Retry activity lock" : "Start activity"}
          onClick={() => {
            setOpen(false);
            setStartOpen((value) => !value);
          }}
        >
          <Play size={24} strokeWidth={2.25} />
        </Button>
      )}

      {startOpen && activity.status === "idle" && (
        <ActivityTypeMenu
          className="absolute top-[calc(100%+8px)] right-0"
          onSelect={(activityType) => {
            setStartOpen(false);
            activity.start({
              title: workspaceTitle,
              activityType,
              workspaceId,
              workspaceTitleSnapshot: workspaceTitle,
            });
          }}
        />
      )}

      {open && (
        <PopupSurface
          className="absolute top-[calc(100%+8px)] right-0 z-25 w-[320px] p-3 max-[520px]:right-[-8px] max-[520px]:w-[min(320px,calc(100vw_-_24px))]"
          role="dialog"
          aria-label="Activity"
        >
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-ink">
            <span>Activity</span>
            <Timer size={16} className="text-muted" />
          </div>

          {activity.activeContext && (
            <div className="mt-3 border-b border-line pb-2.5">
              <div className="truncate text-[11px] font-medium text-ink">{activity.activeContext.title}</div>
              <div className="mt-0.5 text-[9px] capitalize text-muted">
                {activity.activeContext.activityType}
                {activity.activeContext.workspaceTitleSnapshot
                  ? ` · ${activity.activeContext.workspaceTitleSnapshot}`
                  : ""}
              </div>
            </div>
          )}

          <dl className="my-3.5 grid gap-[9px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[10px] text-muted">Current session</dt>
              <dd className="m-0 text-[11px] text-ink">{formatDuration(activity.currentSeconds)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[10px] text-muted">Today</dt>
              <dd className="m-0 text-[11px] text-ink">{formatDuration(activity.todaySeconds)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[10px] text-muted">Total</dt>
              <dd className="m-0 text-[11px] text-ink">{formatDuration(activity.totalSeconds)}</dd>
            </div>
          </dl>

          <div className="border-t border-line pt-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-ink">Recent sessions</span>
              {activity.status !== "idle" && (
                <span className="text-[9px] text-muted">End activity to clean history</span>
              )}
            </div>

            {sessionsLoading ? (
              <div className="grid gap-2" role="status" aria-label="Loading recent activity sessions">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full opacity-70" />
              </div>
            ) : sessionsError ? (
              <p className="m-0 text-[10px] text-danger">{sessionsError}</p>
            ) : sessions.length ? (
              <div className="grid max-h-[210px] gap-1 overflow-y-auto pr-0.5" role="list" aria-label="Recent activity sessions">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-tint"
                    role="listitem"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] text-ink">{session.title}</div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[9px] text-muted">
                        <span className="capitalize">{session.activityType}</span>
                        <span>·</span>
                        <span>{formatDuration(session.activeSeconds)}</span>
                        <span>·</span>
                        <span className="truncate">
                          {formatDay(session.activityDate)}
                          {sessionTime(session.startedAt) ? ` · ${sessionTime(session.startedAt)}` : ""}
                        </span>
                        {!session.endedAt && <span>not ended</span>}
                      </div>
                    </div>
                    <IconButton
                      type="button"
                      className="!size-6 shrink-0 text-muted hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-danger"
                      aria-label={`Delete activity ${session.title}`}
                      title={activity.status === "idle" && !activity.blockedByOtherTab
                        ? "Delete session"
                        : "End the active activity before deleting history"}
                      disabled={activity.status !== "idle" || activity.blockedByOtherTab || deletingSessionId === session.id}
                      onClick={() => void removeSession(session)}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[10px] text-muted">No recorded activity yet.</p>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-[5px] border-t border-line pt-2.5 text-[10px] text-muted">
            <i className={cn(
              "text-[9px] not-italic",
              activity.status === "running" ? "text-success" : "text-muted",
            )}>●</i>
            {state}
          </div>
        </PopupSurface>
      )}
    </div>
  );
}
