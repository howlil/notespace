import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { getStudyActivity, getStudyDayDetail } from "../../domain/project/api";
import type { StudyActivity, StudyDayDetail } from "../../domain/project/api";
import { useToast } from "../../providers/toast-provider";
import { formatDay, formatDuration, localDate } from "./study-timer";
import "./study.css";

function dateWithOffset(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function level(seconds: number) {
  if (seconds >= 120 * 60) return 5;
  if (seconds >= 60 * 60) return 4;
  if (seconds >= 30 * 60) return 3;
  if (seconds >= 15 * 60) return 2;
  if (seconds >= 60) return 1;
  return 0;
}

export function StudyActivityDashboard({ compact = false }: { compact?: boolean }) {
  const { showToast } = useToast();
  const [activity, setActivity] = useState<StudyActivity | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudyDayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const from = useMemo(() => dateWithOffset(-364), []);
  const to = useMemo(() => dateWithOffset(0), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void getStudyActivity(from, to).then((data) => { if (!cancelled) setActivity(data); }).catch((err) => { if (!cancelled) { setActivity(null); setLoadError(err instanceof Error ? err.message : "Could not load study activity."); showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load study activity." }); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, showToast]);

  function selectDay(date: string) {
    setSelectedDate(date);
    setDetail(null);
    setDetailLoading(true);
    void getStudyDayDetail(date).then(setDetail).catch(() => showToast({ kind: "error", message: "Could not load this day." })).finally(() => setDetailLoading(false));
  }

  const gridStart = useMemo(() => {
    const date = new Date(`${from}T12:00:00`);
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    return date;
  }, [from]);

  function position(date: string) {
    const value = new Date(`${date}T12:00:00`);
    const difference = Math.round((value.getTime() - gridStart.getTime()) / 86_400_000);
    return { column: Math.floor(difference / 7) + 1, row: (difference % 7) + 1 };
  }

  return <section className={compact ? "study-activity study-activity-compact" : "study-activity"} aria-labelledby="study-activity-title">
    <div className="study-activity-heading"><div><h2 id="study-activity-title">Learning activity</h2><p>Active study time over the last year</p></div></div>
    <div className="study-summary">
      <div><span>Today</span><strong>{loading ? "—" : formatDuration(activity?.todaySeconds ?? 0)}</strong></div>
      <div><span>This week</span><strong>{loading ? "—" : formatDuration(activity?.weekSeconds ?? 0)}</strong></div>
      <div><span>Streak</span><strong>{loading ? "—" : `${activity?.currentStreak ?? 0} days`}</strong></div>
    </div>
    {loading ? <div className="study-loading"><Loader2 size={16} className="spin" /> Loading activity…</div> : loadError ? <div className="study-loading study-error-state">{loadError}</div> : <>
      <div className="heatmap-scroll"><div className="heatmap" aria-label="Learning activity heatmap">
        {(activity?.days ?? []).map((day) => { const spot = position(day.date); return <button key={day.date} className={`heatmap-day level-${level(day.activeSeconds)}`} style={{ gridColumn: spot.column, gridRow: spot.row }} title={`${formatDay(day.date)} · ${formatDuration(day.activeSeconds)}`} aria-label={`${formatDay(day.date)}: ${formatDuration(day.activeSeconds)}`} onClick={() => selectDay(day.date)} aria-pressed={selectedDate === day.date} />; })}
      </div></div>
      <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4, 5].map((value) => <i key={value} className={`heatmap-day level-${value}`} aria-hidden="true" />)}<span>More</span></div>
    </>}
    {selectedDate && <div className="study-day-detail"><div className="study-day-heading"><div><span>{formatDay(selectedDate)}</span><strong>{detailLoading ? "Loading…" : formatDuration(detail?.activeSeconds ?? 0)} studied</strong></div><button className="text-button" onClick={() => { setSelectedDate(null); setDetail(null); }}>Close</button></div>{detailLoading ? <div className="study-loading">Loading day…</div> : detail?.workspaces.length ? <div className="study-workspace-breakdown">{detail.workspaces.map((workspace) => <div key={workspace.workspaceId}><span>{workspace.title}{workspace.deleted && <em> deleted</em>}</span><strong>{formatDuration(workspace.activeSeconds)}</strong></div>)}</div> : <p className="study-empty-detail">No recorded study time on this day.</p>}</div>}
  </section>;
}
