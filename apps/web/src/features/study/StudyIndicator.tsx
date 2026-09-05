import { Pause, Play, Timer } from "lucide-react";
import type { StudySessionState } from "./use-study-session";
import { formatDuration } from "./study-timer";
import { useCallback, useRef, useState } from "react";
import { useDismissablePopup } from "../../components/ui/dismissable";
import "./study.css";

export function StudyIndicator({ study }: { study: StudySessionState }) {
  const [open, setOpen] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissablePopup(indicatorRef, open, dismiss);
  const state = study.tracking ? "Tracking" : study.pausedReason === "idle" ? "Idle · paused" : "Paused";
  return <div ref={indicatorRef} className="study-indicator-wrap">
    <button className="study-indicator" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <span className={study.tracking ? "study-live-dot" : "study-paused-dot"}>●</span> {formatDuration(study.todaySeconds)}
    </button>
    {open && <div className="study-popover" role="dialog" aria-label="Study activity">
      <div className="study-popover-heading"><span>Study activity</span><Timer size={14} /></div>
      <dl className="study-stats"><div><dt>Current session</dt><dd>{formatDuration(study.currentSeconds)}</dd></div><div><dt>Today</dt><dd>{formatDuration(study.todaySeconds)}</dd></div><div><dt>Total</dt><dd>{formatDuration(study.totalSeconds)}</dd></div></dl>
      <div className="study-popover-footer"><span><i className={study.tracking ? "study-live-dot" : "study-paused-dot"}>●</i> {state}</span><button className="secondary compact-action" onClick={() => { if (study.tracking) study.pause(); else study.resume(); setOpen(false); }}>{study.tracking ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button></div>
    </div>}
  </div>;
}
