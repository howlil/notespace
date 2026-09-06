import { useCallback, useEffect, useRef, useState } from "react";
import { getWorkspaceStudy, recordStudyHeartbeat } from "../../domain/project/api";
import {
  advanceStudySession,
  combineStudyStats,
  currentSegmentSeconds,
  currentSessionSeconds,
  localDate,
  materializeStudySession,
  resumeStudySession,
} from "./study-timer";
import type { ManualStudySession } from "./study-timer";

export type StudySessionState = {
  currentSeconds: number;
  todaySeconds: number;
  totalSeconds: number;
  status: "idle" | "running" | "paused";
  ready: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
};

function storageKey(workspaceId: string) {
  return `notespace.study-session:${workspaceId}`;
}

function readStoredSession(workspaceId: string): ManualStudySession | null {
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ManualStudySession>;
    if (
      typeof value.segmentId !== "string"
      || typeof value.activityDate !== "string"
      || (value.status !== "running" && value.status !== "paused")
      || typeof value.sessionAccumulatedSeconds !== "number"
      || typeof value.segmentAccumulatedSeconds !== "number"
      || (value.runningSince !== null && typeof value.runningSince !== "number")
      || typeof value.baselineTodaySeconds !== "number"
      || typeof value.baselineTotalSeconds !== "number"
    ) return null;
    return value as ManualStudySession;
  } catch {
    return null;
  }
}

export function useStudySession(workspaceId: string, _workspaceTitle: string): StudySessionState {
  const [session, setSession] = useState<ManualStudySession | null>(null);
  const sessionRef = useRef<ManualStudySession | null>(null);
  const [baseline, setBaseline] = useState({ todaySeconds: 0, totalSeconds: 0 });
  const [baselineDate, setBaselineDate] = useState(localDate());
  const [clock, setClock] = useState(Date.now());
  const [ready, setReady] = useState(false);

  const commitSession = useCallback((next: ManualStudySession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
    else window.localStorage.removeItem(storageKey(workspaceId));
  }, [workspaceId]);

  const sendSegment = useCallback((id: string, date: string, activeSeconds: number, finish: boolean) => {
    void recordStudyHeartbeat(workspaceId, id, { activityDate: date, activeSeconds, finish }).catch(() => {});
  }, [workspaceId]);

  const reconcile = useCallback((value: ManualStudySession, now: number) => {
    const result = advanceStudySession(value, now, () => crypto.randomUUID());
    if (result.completed.length > 0) {
      result.completed.forEach((item) => sendSegment(item.id, item.date, item.activeSeconds, true));
      commitSession(result.session);
      if (result.session.status === "running") {
        sendSegment(result.session.segmentId, result.session.activityDate, currentSegmentSeconds(result.session, now), false);
      }
    }
    return result.session;
  }, [commitSession, sendSegment]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const now = Date.now();
    const restored = readStoredSession(workspaceId);
    if (restored) {
      const result = advanceStudySession(restored, now, () => crypto.randomUUID());
      result.completed.forEach((item) => sendSegment(item.id, item.date, item.activeSeconds, true));
      commitSession(result.session);
      setBaseline({
        todaySeconds: result.session.baselineTodaySeconds,
        totalSeconds: result.session.baselineTotalSeconds,
      });
      setBaselineDate(result.session.activityDate);
      setClock(now);
      setReady(true);
      if (result.session.status === "running") {
        sendSegment(result.session.segmentId, result.session.activityDate, currentSegmentSeconds(result.session, now), false);
      }
      return () => { cancelled = true; };
    }

    void getWorkspaceStudy(workspaceId, localDate(new Date(now)))
      .then((stats) => {
        if (cancelled) return;
        setBaseline(stats);
        setBaselineDate(localDate(new Date(now)));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [commitSession, sendSegment, workspaceId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      const current = sessionRef.current;
      if (!current) return;
      reconcile(current, now);
    }, session?.status === "running" ? 1000 : 60_000);
    return () => window.clearInterval(interval);
  }, [reconcile, session?.status]);

  useEffect(() => {
    if (!session || session.status !== "running") return;
    const heartbeat = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current || current.status !== "running") return;
      const now = Date.now();
      const next = reconcile(current, now);
      sendSegment(next.segmentId, next.activityDate, currentSegmentSeconds(next, now), false);
    }, 30_000);
    return () => {
      window.clearInterval(heartbeat);
      const current = sessionRef.current;
      if (current?.status === "running") {
        const now = Date.now();
        sendSegment(current.segmentId, current.activityDate, currentSegmentSeconds(current, now), false);
      }
    };
  }, [reconcile, sendSegment, session?.status]);

  function start() {
    if (!ready || sessionRef.current) return;
    const now = Date.now();
    const date = localDate(new Date(now));
    const effectiveBaseline = {
      todaySeconds: baselineDate === date ? baseline.todaySeconds : 0,
      totalSeconds: baseline.totalSeconds,
    };
    const next: ManualStudySession = {
      segmentId: crypto.randomUUID(),
      activityDate: date,
      status: "running",
      sessionAccumulatedSeconds: 0,
      segmentAccumulatedSeconds: 0,
      runningSince: now,
      baselineTodaySeconds: effectiveBaseline.todaySeconds,
      baselineTotalSeconds: effectiveBaseline.totalSeconds,
    };
    setBaseline(effectiveBaseline);
    setBaselineDate(date);
    setClock(now);
    commitSession(next);
    sendSegment(next.segmentId, next.activityDate, 0, false);
  }

  function pause() {
    const current = sessionRef.current;
    if (!current || current.status !== "running") return;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    const next = materializeStudySession(reconciled, now);
    commitSession(next);
    setClock(now);
    sendSegment(next.segmentId, next.activityDate, next.segmentAccumulatedSeconds, false);
  }

  function resume() {
    const current = sessionRef.current;
    if (!current || current.status !== "paused") return;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    const next = resumeStudySession(reconciled, now);
    commitSession(next);
    setClock(now);
    sendSegment(next.segmentId, next.activityDate, next.segmentAccumulatedSeconds, false);
  }

  function end() {
    const current = sessionRef.current;
    if (!current) return;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    const finished = reconciled.status === "running" ? materializeStudySession(reconciled, now) : reconciled;
    sendSegment(finished.segmentId, finished.activityDate, finished.segmentAccumulatedSeconds, true);
    const nextBaseline = {
      todaySeconds: Math.max(0, finished.baselineTodaySeconds) + Math.max(0, finished.segmentAccumulatedSeconds),
      totalSeconds: Math.max(0, finished.baselineTotalSeconds) + Math.max(0, finished.sessionAccumulatedSeconds),
    };
    setBaseline(nextBaseline);
    setBaselineDate(finished.activityDate);
    setClock(now);
    commitSession(null);
  }

  const date = localDate(new Date(clock));
  const currentSeconds = session ? currentSessionSeconds(session, clock) : 0;
  const todayCurrentSeconds = session && session.activityDate === date ? currentSegmentSeconds(session, clock) : 0;
  const displayBaseline = session
    ? { todaySeconds: session.baselineTodaySeconds, totalSeconds: session.baselineTotalSeconds }
    : { todaySeconds: baselineDate === date ? baseline.todaySeconds : 0, totalSeconds: baseline.totalSeconds };
  const totals = combineStudyStats(displayBaseline, session ? todayCurrentSeconds : 0, currentSeconds);

  return {
    currentSeconds,
    todaySeconds: totals.todaySeconds,
    totalSeconds: totals.totalSeconds,
    status: session?.status ?? "idle",
    ready,
    start,
    pause,
    resume,
    end,
  };
}
