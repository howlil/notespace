import { Pause, Play, Square, Timer } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button, cn } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";
import type { StudySessionState } from "./use-study-session";
import { formatDuration } from "./study-timer";

export function StudyIndicator({ study }: { study: StudySessionState }) {
  const [open, setOpen] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissablePopup(indicatorRef, open, dismiss);

  const state = study.status === "running" ? "Running" : study.status === "paused" ? "Paused" : "No active session";

  return (
    <div ref={indicatorRef} className="relative flex items-center gap-1">
      <button
        className="inline-flex min-h-7 items-center gap-[5px] rounded-md border-0 bg-transparent px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink focus-visible:bg-tint focus-visible:text-ink"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Study activity, today ${formatDuration(study.todaySeconds)}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cn("text-[9px] not-italic", study.status === "running" ? "text-success" : "text-muted")}>●</span>
        {formatDuration(study.todaySeconds)}
      </button>

      {study.status === "idle" ? (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-7 px-2 py-[5px] text-[10px] whitespace-nowrap"
          disabled={!study.ready}
          onClick={study.start}
        >
          <Play size={12} /> Start
        </Button>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-7 px-2 py-[5px] text-[10px] whitespace-nowrap"
            onClick={study.status === "running" ? study.pause : study.resume}
          >
            {study.status === "running" ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-7 px-2 py-[5px] text-[10px] whitespace-nowrap"
            onClick={study.end}
          >
            <Square size={11} /> End
          </Button>
        </>
      )}

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-25 w-[235px] rounded-lg border border-line bg-surface p-3 shadow-[0_12px_32px_#0002] max-[520px]:right-[-8px]" role="dialog" aria-label="Study activity">
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-ink"><span>Study activity</span><Timer size={14} className="text-muted" /></div>
          <dl className="my-3.5 grid gap-[9px]">
            <div className="flex items-baseline justify-between gap-3"><dt className="text-[10px] text-muted">Current session</dt><dd className="m-0 text-[11px] text-ink">{formatDuration(study.currentSeconds)}</dd></div>
            <div className="flex items-baseline justify-between gap-3"><dt className="text-[10px] text-muted">Today</dt><dd className="m-0 text-[11px] text-ink">{formatDuration(study.todaySeconds)}</dd></div>
            <div className="flex items-baseline justify-between gap-3"><dt className="text-[10px] text-muted">Total</dt><dd className="m-0 text-[11px] text-ink">{formatDuration(study.totalSeconds)}</dd></div>
          </dl>
          <div className="flex items-center gap-[5px] border-t border-line pt-2.5 text-[10px] text-muted">
            <i className={cn("text-[9px] not-italic", study.status === "running" ? "text-success" : "text-muted")}>●</i>
            {state}
          </div>
        </div>
      )}
    </div>
  );
}
