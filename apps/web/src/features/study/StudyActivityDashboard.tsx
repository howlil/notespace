import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../components/ui";
import { getStudyActivity, getStudyDayDetail } from "../../domain/project/api";
import type { StudyActivity, StudyDayDetail } from "../../domain/project/api";
import { useToast } from "../../providers/toast-provider";
import { formatDay, formatDuration, localDate } from "./study-timer";

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

const heatmapCell = "size-[11px] rounded-[2px] border-0 p-0";
const heatmapLevels = [
  "bg-[color-mix(in_srgb,var(--line)_42%,var(--surface))]",
  "bg-[color-mix(in_srgb,var(--accent)_22%,var(--surface))]",
  "bg-[color-mix(in_srgb,var(--accent)_40%,var(--surface))]",
  "bg-[color-mix(in_srgb,var(--accent)_58%,var(--surface))]",
  "bg-[color-mix(in_srgb,var(--accent)_76%,var(--surface))]",
  "bg-accent",
] as const;

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

  return (
    <section className={cn("mb-7 border-y border-line pt-4 pb-[18px]", compact && "mt-[25px] pb-4")} aria-labelledby="study-activity-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="study-activity-title" className="m-0 text-sm font-medium text-ink">Learning activity</h2>
          {!compact && <p className="mt-[5px] mb-0 text-[10px] text-muted">Active study time over the last year</p>}
        </div>
      </div>
      {!compact && (
        <div className="my-[18px] mb-[19px] grid grid-cols-3 gap-6 max-[520px]:gap-3">
          <div className="flex flex-col gap-[5px]"><span className="text-[10px] text-muted">Today</span><strong className="text-lg font-medium tracking-[-.4px] text-ink max-[520px]:text-[15px]">{loading ? "—" : formatDuration(activity?.todaySeconds ?? 0)}</strong></div>
          <div className="flex flex-col gap-[5px]"><span className="text-[10px] text-muted">This week</span><strong className="text-lg font-medium tracking-[-.4px] text-ink max-[520px]:text-[15px]">{loading ? "—" : formatDuration(activity?.weekSeconds ?? 0)}</strong></div>
          <div className="flex flex-col gap-[5px]"><span className="text-[10px] text-muted">Streak</span><strong className="text-lg font-medium tracking-[-.4px] text-ink max-[520px]:text-[15px]">{loading ? "—" : `${activity?.currentStreak ?? 0} days`}</strong></div>
        </div>
      )}
      {loading ? (
        <div className="flex min-h-[54px] items-center gap-[7px] text-[10px] text-muted"><Loader2 size={16} className="animate-spin" /> Loading activity…</div>
      ) : loadError ? (
        <div className="flex min-h-[54px] items-center gap-[7px] text-[10px] text-danger">{loadError}</div>
      ) : (
        <>
          <div className="overflow-x-auto overflow-y-hidden pb-[3px]">
            <div className="grid w-max min-w-full auto-cols-[11px] grid-rows-[repeat(7,11px)] gap-[3px]" aria-label="Learning activity heatmap">
              {(activity?.days ?? []).map((day) => {
                const spot = position(day.date);
                return (
                  <button
                    key={day.date}
                    className={cn(heatmapCell, "hover:outline-2 hover:outline-offset-1 hover:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-accent", heatmapLevels[level(day.activeSeconds)])}
                    style={{ gridColumn: spot.column, gridRow: spot.row }}
                    title={`${formatDay(day.date)} · ${formatDuration(day.activeSeconds)}`}
                    aria-label={`${formatDay(day.date)}: ${formatDuration(day.activeSeconds)}`}
                    onClick={() => selectDay(day.date)}
                    aria-pressed={selectedDate === day.date}
                  />
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-muted">
            <span className="mx-[3px]">Less</span>
            {[0, 1, 2, 3, 4, 5].map((value) => <i key={value} className={cn(heatmapCell, heatmapLevels[value])} aria-hidden="true" />)}
            <span className="mx-[3px]">More</span>
          </div>
        </>
      )}
      {selectedDate && (
        <div className="mt-4 border-t border-line pt-[13px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-[5px]"><span className="text-[10px] text-muted">{formatDay(selectedDate)}</span><strong className="text-[13px] font-medium text-ink">{detailLoading ? "Loading…" : formatDuration(detail?.activeSeconds ?? 0)} studied</strong></div>
            <button className="border-0 bg-transparent p-[3px] text-[10px] text-muted hover:text-ink focus-visible:text-ink" onClick={() => { setSelectedDate(null); setDetail(null); }}>Close</button>
          </div>
          {detailLoading ? (
            <div className="flex min-h-[54px] items-center gap-[7px] text-[10px] text-muted">Loading day…</div>
          ) : detail?.workspaces.length ? (
            <div className="mt-[13px] grid gap-2">
              {detail.workspaces.map((workspace) => (
                <div key={workspace.workspaceId} className="flex justify-between gap-3 text-[11px] text-ink">
                  <span>{workspace.title}{workspace.deleted && <em className="text-[9px] not-italic text-muted"> deleted</em>}</span>
                  <strong className="font-normal text-muted">{formatDuration(workspace.activeSeconds)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="mt-[13px] mb-0 text-[10px] text-muted">No recorded study time on this day.</p>}
        </div>
      )}
    </section>
  );
}
