export const IDLE_AFTER_MS = 10 * 60 * 1000;

export type StudyBaseline = { todaySeconds: number; totalSeconds: number };

export function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function combineStudyStats(baseline: StudyBaseline, currentSeconds: number) {
  const current = Math.max(0, currentSeconds);
  return {
    todaySeconds: Math.max(0, baseline.todaySeconds) + current,
    totalSeconds: Math.max(0, baseline.totalSeconds) + current,
  };
}

export function rollStudyBaseline(baseline: StudyBaseline, completedSeconds: number): StudyBaseline {
  return {
    todaySeconds: 0,
    totalSeconds: Math.max(0, baseline.totalSeconds) + Math.max(0, completedSeconds),
  };
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function formatDay(date: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}
