import { useEffect, useMemo, useState } from "react";
import { Button, Skeleton, cn } from "../../components/ui";
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

function ActivitySkeleton() {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading learning activity">
      <span className="sr-only">Loading learning activity…</span>
      <div className="grid w-max min-w-full grid-cols-[repeat(52,12px)] grid-rows-[repeat(7,12px)] gap-[3px] overflow-hidden" aria-hidden="true">
        {Array.from({ length: 364 }, (_, index) => <Skeleton key={index} className="size-3 rounded-[2px] opacity-70" />)}
      </div>
      <div className="flex items-center justify-end gap-1" aria-hidden="true"><Skeleton className="h-2 w-7" /><Skeleton className="size-3 rounded-[2px]" /><Skeleton className="size-3 rounded-[2px] opacity-80" /><Skeleton className="size-3 rounded-[2px] opacity-60" /><Skeleton className="size-3 rounded-[2px] opacity-40" /></div>
    </div>
  );
}

const heatmapCell = "size-3 rounded-[2px] border-0 p-0";
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
  const [mobileExpanded, setMobileExpanded] = useState(false);
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

  const mobileHeatmapVisibility = mobileExpanded ? "max-[560px]:block" : "max-[560px]:hidden";

  return (
    <section className={cn("mb-6 overflow-hidden rounded-lg border border-line bg-surface max-[560px]:mb-5", compact && "mt-6")} aria-labelledby="study-activity-title">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 max-[560px]:border-b-0 max-[560px]:pb-1">
        <div>
          <h2 id="study-activity-title" className="m-0 text-[13px] font-medium text-ink">Learning activity</h2>
          {!compact && <p className="mt-1 mb-0 text-[10px] text-muted max-[560px]:hidden">Your study rhythm over the last year</p>}
        </div>
        {!compact && <span className="pt-0.5 text-[10px] text-muted max-[560px]:hidden">Last 365 days</span>}
      </div>
      {!compact && (
        <div className="grid grid-cols-3 border-b border-line px-4 py-3 max-[520px]:gap-3 max-[560px]:pt-2">
          <div className="flex flex-col gap-1 border-r border-line"><span className="text-[10px] text-muted">Today</span><strong className="text-base font-medium tracking-[-.3px] text-ink max-[520px]:text-[14px]">{loading ? <Skeleton className="h-5 w-14" /> : formatDuration(activity?.todaySeconds ?? 0)}</strong></div>
          <div className="flex flex-col gap-1 border-r border-line pl-4 max-[520px]:pl-0"><span className="text-[10px] text-muted">This week</span><strong className="text-base font-medium tracking-[-.3px] text-ink max-[520px]:text-[14px]">{loading ? <Skeleton className="h-5 w-16" /> : formatDuration(activity?.weekSeconds ?? 0)}</strong></div>
          <div className="flex flex-col gap-1 pl-4 max-[520px]:pl-0"><span className="text-[10px] text-muted">Streak</span><strong className="text-base font-medium tracking-[-.3px] text-ink max-[520px]:text-[14px]">{loading ? <Skeleton className="h-5 w-20" /> : `${activity?.currentStreak ?? 0} days`}</strong></div>
        </div>
      )}
      {!compact && (
        <div className="hidden items-center justify-between px-4 py-2 max-[560px]:flex">
          <span className="text-[10px] text-muted">Last 365 days</span>
          <Button type="button" variant="ghost" size="sm" className="!min-h-0 px-1.5 py-1 text-[10px] text-accent" aria-expanded={mobileExpanded} onClick={() => setMobileExpanded((value) => !value)}>{mobileExpanded ? "Hide heatmap" : "View heatmap"}</Button>
        </div>
      )}
      {loading ? (
        <div className={cn("px-4 py-4", mobileHeatmapVisibility)}><ActivitySkeleton /></div>
      ) : loadError ? (
        <div className={cn("flex min-h-[54px] items-center gap-[7px] px-4 py-4 text-[10px] text-danger", mobileHeatmapVisibility)}>{loadError}</div>
      ) : (
        <div className={cn("px-4 pt-4 pb-3", mobileHeatmapVisibility)}>
          <div className="overflow-x-auto overflow-y-hidden pb-[3px]">
            <div className="grid w-max min-w-full auto-cols-[12px] grid-rows-[repeat(7,12px)] gap-[3px]" aria-label="Learning activity heatmap">
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
        </div>
      )}
      {selectedDate && (
        <div className="border-t border-line px-4 pt-[13px] pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-[5px]"><span className="text-[10px] text-muted">{formatDay(selectedDate)}</span><strong className="text-[13px] font-medium text-ink">{detailLoading ? <Skeleton className="h-4 w-24" /> : `${formatDuration(detail?.activeSeconds ?? 0)} studied`}</strong></div>
            <Button type="button" variant="ghost" size="sm" className="!min-h-0 px-[3px] py-[3px] text-[10px] text-muted hover:text-ink focus-visible:text-ink" onClick={() => { setSelectedDate(null); setDetail(null); }}>Close</Button>
          </div>
          {detailLoading ? (
            <div className="grid gap-2" role="status" aria-label="Loading day details"><span className="sr-only">Loading day details…</span><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-[74%] opacity-70" /><Skeleton className="h-3 w-[58%] opacity-50" /></div>
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
