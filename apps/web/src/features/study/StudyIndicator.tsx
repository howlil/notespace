import { Pause, Play, Square, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton, PopupSurface, Skeleton, cn } from "../../components/ui";
import { listStudySessions } from "../../domain/project/api";
import type { StudySession } from "../../domain/project/api";
import { useDismissablePopup } from "../../components/ui/dismissable";
import { useToast } from "../../providers/toast-provider";
import type { StudySessionState } from "./use-study-session";
import { formatDay, formatDuration } from "./study-timer";

const timerActionClass = "!size-8 !min-h-8 shrink-0 p-0 text-muted hover:text-accent focus-visible:bg-tint focus-visible:text-accent";

function sessionTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function StudyIndicator({ study }: { study: StudySessionState }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissablePopup(indicatorRef, open, dismiss);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSessionsLoading(true);
    setSessionsError(null);
    void listStudySessions(study.workspaceId, 6)
      .then((items) => { if (active) setSessions(items); })
      .catch((error) => {
        if (!active) return;
        setSessions([]);
        setSessionsError(error instanceof Error ? error.message : "Could not load study sessions.");
      })
      .finally(() => { if (active) setSessionsLoading(false); });
    return () => { active = false; };
  }, [open, study.workspaceId]);

  async function removeSession(session: StudySession) {
    if (study.status !== "idle" || deletingSessionId) return;
    setDeletingSessionId(session.id);
    try {
      await study.deleteSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      showToast({ kind: "success", message: "Study session deleted." });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not delete this study session." });
    } finally {
      setDeletingSessionId(null);
    }
  }

  const state = study.status === "running" ? "Running" : study.status === "paused" ? "Paused" : "No active session";

  return (
    <div ref={indicatorRef} className="relative flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-8 gap-1.5 px-2 py-1 text-[11px] text-muted hover:text-ink focus-visible:bg-tint focus-visible:text-ink"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Study activity, today ${formatDuration(study.todaySeconds)}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cn("text-[10px] leading-none not-italic", study.status === "running" ? "text-success" : "text-muted")}>●</span>
        {formatDuration(study.todaySeconds)}
      </Button>

      {study.status === "idle" ? (
        <Button
          variant="secondary"
          size="sm"
          className={timerActionClass}
          disabled={!study.ready}
          aria-label="Start study session"
          title="Start"
          onClick={study.start}
        >
          <Play size={18} strokeWidth={2.25} />
        </Button>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            className={timerActionClass}
            aria-label={study.status === "running" ? "Pause study session" : "Resume study session"}
            title={study.status === "running" ? "Pause" : "Resume"}
            onClick={study.status === "running" ? study.pause : study.resume}
          >
            {study.status === "running" ? <Pause size={18} strokeWidth={2.25} /> : <Play size={18} strokeWidth={2.25} />}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={timerActionClass}
            aria-label="End study session"
            title="End"
            onClick={study.end}
          >
            <Square size={17} strokeWidth={2.25} />
          </Button>
        </>
      )}

      {open && (
        <PopupSurface className="absolute top-[calc(100%+8px)] right-0 z-25 w-[300px] p-3 max-[520px]:right-[-8px] max-[520px]:w-[min(300px,calc(100vw_-_24px))]" role="dialog" aria-label="Study activity">
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-ink"><span>Study activity</span><Timer size={16} className="text-muted" /></div>
          <dl className="my-3.5 grid gap-[9px]">
            <div className="flex items-baseline justify-between gap-3"><dt className="text-[10px] text-muted">Current session</dt><dd className="m-0 text-[11px] text-ink">{formatDuration(study.currentSeconds)}</dd></div>
            <div className="flex items-baseline justify-between gap-3"><dt className="text-[10px] text-muted">Today</dt><dd className="m-0 text-[11px] text-ink">{formatDuration(study.todaySeconds)}</dd></div>
            <div className="flex items-baseline justify-between gap-3"><dt className="text-[10px] text-muted">Total</dt><dd className="m-0 text-[11px] text-ink">{formatDuration(study.totalSeconds)}</dd></div>
          </dl>

          <div className="border-t border-line pt-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-ink">Recent sessions</span>
              {study.status !== "idle" && <span className="text-[9px] text-muted">End session to clean history</span>}
            </div>
            {sessionsLoading ? (
              <div className="grid gap-2" role="status" aria-label="Loading recent study sessions"><Skeleton className="h-7 w-full" /><Skeleton className="h-7 w-full opacity-70" /></div>
            ) : sessionsError ? (
              <p className="m-0 text-[10px] text-danger">{sessionsError}</p>
            ) : sessions.length ? (
              <div className="grid max-h-[190px] gap-1 overflow-y-auto pr-0.5">
                {sessions.map((session) => (
                  <div key={session.id} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-tint">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] text-ink">{formatDay(session.activityDate)}{sessionTime(session.startedAt) ? ` · ${sessionTime(session.startedAt)}` : ""}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted"><span>{formatDuration(session.activeSeconds)}</span>{!session.endedAt && <span>not ended</span>}</div>
                    </div>
                    <IconButton
                      type="button"
                      className="!size-6 shrink-0 text-muted hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-danger"
                      aria-label={`Delete study session from ${formatDay(session.activityDate)}`}
                      title={study.status === "idle" ? "Delete session" : "End the current session before deleting history"}
                      disabled={study.status !== "idle" || deletingSessionId === session.id}
                      onClick={() => void removeSession(session)}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[10px] text-muted">No recorded sessions yet.</p>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-[5px] border-t border-line pt-2.5 text-[10px] text-muted">
            <i className={cn("text-[9px] not-italic", study.status === "running" ? "text-success" : "text-muted")}>●</i>
            {state}
          </div>
        </PopupSurface>
      )}
    </div>
  );
}
