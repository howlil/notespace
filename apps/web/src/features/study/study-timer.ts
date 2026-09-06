export type StudyBaseline = { todaySeconds: number; totalSeconds: number };

export type ManualStudySession = {
  segmentId: string;
  activityDate: string;
  status: "running" | "paused";
  sessionAccumulatedSeconds: number;
  segmentAccumulatedSeconds: number;
  runningSince: number | null;
  baselineTodaySeconds: number;
  baselineTotalSeconds: number;
};

export type CompletedStudySegment = {
  id: string;
  date: string;
  activeSeconds: number;
};

export function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextLocalDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day + 1);
}

function elapsedSeconds(from: number | null, to: number) {
  if (from === null) return 0;
  return Math.max(0, Math.floor((to - from) / 1000));
}

export function currentSessionSeconds(session: ManualStudySession, now = Date.now()) {
  return Math.max(0, session.sessionAccumulatedSeconds)
    + (session.status === "running" ? elapsedSeconds(session.runningSince, now) : 0);
}

export function currentSegmentSeconds(session: ManualStudySession, now = Date.now()) {
  return Math.max(0, session.segmentAccumulatedSeconds)
    + (session.status === "running" ? elapsedSeconds(session.runningSince, now) : 0);
}

export function materializeStudySession(session: ManualStudySession, now = Date.now()): ManualStudySession {
  if (session.status !== "running") return session;
  const elapsed = elapsedSeconds(session.runningSince, now);
  return {
    ...session,
    status: "paused",
    sessionAccumulatedSeconds: Math.max(0, session.sessionAccumulatedSeconds) + elapsed,
    segmentAccumulatedSeconds: Math.max(0, session.segmentAccumulatedSeconds) + elapsed,
    runningSince: null,
  };
}

export function resumeStudySession(session: ManualStudySession, now = Date.now()): ManualStudySession {
  if (session.status !== "paused") return session;
  return { ...session, status: "running", runningSince: now };
}

export function advanceStudySession(
  session: ManualStudySession,
  now: number,
  idFactory: () => string,
): { session: ManualStudySession; completed: CompletedStudySegment[] } {
  const targetDate = localDate(new Date(now));
  if (session.activityDate >= targetDate) return { session, completed: [] };

  const completed: CompletedStudySegment[] = [];
  let current = { ...session };

  if (current.status === "paused") {
    completed.push({ id: current.segmentId, date: current.activityDate, activeSeconds: Math.max(0, current.segmentAccumulatedSeconds) });
    return {
      completed,
      session: {
        ...current,
        segmentId: idFactory(),
        activityDate: targetDate,
        segmentAccumulatedSeconds: 0,
        baselineTodaySeconds: 0,
      },
    };
  }

  while (current.activityDate < targetDate) {
    const boundary = nextLocalDay(current.activityDate).getTime();
    const elapsed = elapsedSeconds(current.runningSince, Math.min(boundary, now));
    const segmentSeconds = Math.max(0, current.segmentAccumulatedSeconds) + elapsed;
    const sessionSeconds = Math.max(0, current.sessionAccumulatedSeconds) + elapsed;
    completed.push({ id: current.segmentId, date: current.activityDate, activeSeconds: segmentSeconds });
    const nextDate = localDate(new Date(boundary));
    current = {
      ...current,
      segmentId: idFactory(),
      activityDate: nextDate,
      sessionAccumulatedSeconds: sessionSeconds,
      segmentAccumulatedSeconds: 0,
      runningSince: boundary,
      baselineTodaySeconds: 0,
    };
  }

  return { session: current, completed };
}

export function combineStudyStats(baseline: StudyBaseline, todayCurrentSeconds: number, totalCurrentSeconds = todayCurrentSeconds) {
  return {
    todaySeconds: Math.max(0, baseline.todaySeconds) + Math.max(0, todayCurrentSeconds),
    totalSeconds: Math.max(0, baseline.totalSeconds) + Math.max(0, totalCurrentSeconds),
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
