import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteActivitySession,
  getActivityStats,
  recordActivityHeartbeat,
  type ActivityHeartbeat,
  type ActivityType,
} from "../../adapters/http/activity-api";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "../../adapters/browser/local-storage";
import {
  acknowledgeActivityFinalization,
  enqueueActivityFinalization,
  type PendingActivityFinalization,
} from "./activity-recovery";
import {
  advanceStudySession,
  combineStudyStats,
  currentSegmentSeconds,
  currentSessionSeconds,
  localDate,
  materializeStudySession,
  resumeStudySession,
  studySegmentId,
  type ActivitySessionContext,
  type ManualStudySession,
} from "./study-timer";

export type ActivityStart = {
  title: string;
  activityType: ActivityType;
  workspaceId?: string;
  workspaceTitleSnapshot?: string;
  taskId?: string;
  taskTitleSnapshot?: string;
};

export type StudySessionState = {
  workspaceId: string;
  activeContext?: ActivitySessionContext;
  currentSeconds: number;
  todaySeconds: number;
  totalSeconds: number;
  status: "idle" | "running" | "paused";
  ready: boolean;
  canStart: boolean;
  blockedByOtherTab: boolean;
  start: (context?: ActivityStart) => void;
  pause: () => void;
  resume: () => void;
  end: () => PendingActivityFinalization | null;
  adoptLegacyWorkspace: (context: ActivityStart) => void;
  deleteSession: (sessionId: string) => Promise<void>;
};

type ActivityLease = { release: () => void };

const activityStorageKey = "notespace.activity-session";

function legacyStorageKey(workspaceId: string) {
  return `notespace.study-session:${workspaceId}`;
}

function validStoredSession(value: Partial<ManualStudySession>) {
  return (
    typeof value.segmentId === "string"
    && typeof value.activityDate === "string"
    && (value.status === "running" || value.status === "paused")
    && typeof value.sessionAccumulatedSeconds === "number"
    && typeof value.segmentAccumulatedSeconds === "number"
    && (value.runningSince === null || typeof value.runningSince === "number")
    && typeof value.baselineTodaySeconds === "number"
    && typeof value.baselineTotalSeconds === "number"
  );
}

function readStoredSession(defaultContext?: ActivityStart): ManualStudySession | null {
  try {
    const current = readLocalStorage(activityStorageKey);
    if (current) {
      const value = JSON.parse(current) as Partial<ManualStudySession>;
      if (!validStoredSession(value) || !value.context?.title || !value.context?.activityType) return null;
      const logicalSessionId = typeof value.logicalSessionId === "string" && value.logicalSessionId
        ? value.logicalSessionId
        : value.segmentId!.split(":", 1)[0] || value.segmentId!;
      return { ...value, logicalSessionId } as ManualStudySession;
    }

    if (!defaultContext?.workspaceId) return null;
    const legacyKey = legacyStorageKey(defaultContext.workspaceId);
    const raw = readLocalStorage(legacyKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ManualStudySession>;
    if (!validStoredSession(value)) return null;
    const logicalSessionId = typeof value.logicalSessionId === "string" && value.logicalSessionId
      ? value.logicalSessionId
      : value.segmentId!.split(":", 1)[0] || value.segmentId!;
    const migrated = {
      ...value,
      logicalSessionId,
      context: defaultContext,
    } as ManualStudySession;
    writeLocalStorage(activityStorageKey, JSON.stringify(migrated));
    removeLocalStorage(legacyKey);
    return migrated;
  } catch {
    return null;
  }
}

function heartbeatFor(
  context: ActivitySessionContext,
  date: string,
  activeSeconds: number,
  finish: boolean,
): ActivityHeartbeat {
  return {
    activityDate: date,
    activeSeconds,
    finish,
    title: context.title,
    activityType: context.activityType,
    ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
    ...(context.workspaceTitleSnapshot ? { workspaceTitleSnapshot: context.workspaceTitleSnapshot } : {}),
    ...(context.taskId ? { taskId: context.taskId } : {}),
    ...(context.taskTitleSnapshot ? { taskTitleSnapshot: context.taskTitleSnapshot } : {}),
  };
}

function acquireActivityLease(): Promise<ActivityLease | null> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    return Promise.resolve({ release: () => {} });
  }
  return new Promise((resolve) => {
    let resolved = false;
    void navigator.locks.request(
      "notespace.activity",
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          resolved = true;
          resolve(null);
          return;
        }
        let release!: () => void;
        const held = new Promise<void>((done) => { release = done; });
        resolved = true;
        resolve({ release });
        await held;
      },
    ).catch(() => {
      if (!resolved) resolve(null);
    });
  });
}

export function useActivitySession(defaultContext?: ActivityStart): StudySessionState {
  const defaultContextRef = useRef(defaultContext);
  defaultContextRef.current = defaultContext;

  const [session, setSession] = useState<ManualStudySession | null>(null);
  const sessionRef = useRef<ManualStudySession | null>(null);
  const leaseRef = useRef<ActivityLease | null>(null);
  const acquiringLease = useRef(false);
  const mountedRef = useRef(true);
  const [blockedByOtherTab, setBlockedByOtherTab] = useState(false);
  const [baseline, setBaseline] = useState({ todaySeconds: 0, totalSeconds: 0 });
  const [baselineDate, setBaselineDate] = useState(localDate());
  const [clock, setClock] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const sessionStatus = session?.status ?? "idle";

  const releaseLease = useCallback(() => {
    leaseRef.current?.release();
    leaseRef.current = null;
  }, []);

  const commitSession = useCallback((next: ManualStudySession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) writeLocalStorage(activityStorageKey, JSON.stringify(next));
    else removeLocalStorage(activityStorageKey);
  }, []);

  const sendSegment = useCallback((
    context: ActivitySessionContext | undefined,
    id: string,
    date: string,
    activeSeconds: number,
    finish: boolean,
  ) => {
    if (!context) return;
    void recordActivityHeartbeat(id, heartbeatFor(context, date, activeSeconds, finish)).catch(() => {});
  }, []);

  const queueFinalization = useCallback((
    context: ActivitySessionContext | undefined,
    id: string,
    date: string,
    activeSeconds: number,
    handoffTaskId?: string,
  ) => {
    if (!context) return null;
    const finalization: PendingActivityFinalization = {
      sessionId: id,
      heartbeat: heartbeatFor(context, date, activeSeconds, true),
      ...(handoffTaskId ? { handoffTaskId } : {}),
    };
    return enqueueActivityFinalization(finalization) ? finalization : null;
  }, []);

  const finalizeSegmentBestEffort = useCallback((
    context: ActivitySessionContext | undefined,
    id: string,
    date: string,
    activeSeconds: number,
  ) => {
    const finalization = queueFinalization(context, id, date, activeSeconds);
    if (!finalization) return false;
    void recordActivityHeartbeat(finalization.sessionId, finalization.heartbeat)
      .then(() => {
        acknowledgeActivityFinalization(finalization.sessionId);
      })
      .catch(() => {});
    return true;
  }, [queueFinalization]);

  const reconcile = useCallback((value: ManualStudySession, now: number) => {
    const result = advanceStudySession(value, now);
    if (result.completed.length > 0) {
      const queued = result.completed.every((item) =>
        finalizeSegmentBestEffort(value.context, item.id, item.date, item.activeSeconds));
      if (!queued) return value;
      commitSession(result.session);
      if (result.session.status === "running") {
        sendSegment(
          result.session.context,
          result.session.segmentId,
          result.session.activityDate,
          currentSegmentSeconds(result.session, now),
          false,
        );
      }
    }
    return result.session;
  }, [commitSession, finalizeSegmentBestEffort, sendSegment]);

  const adoptStoredSession = useCallback((stored: ManualStudySession, now: number) => {
    const result = advanceStudySession(stored, now);
    const queued = result.completed.every((item) =>
      finalizeSegmentBestEffort(stored.context, item.id, item.date, item.activeSeconds));
    const adopted = queued ? result.session : stored;
    commitSession(adopted);
    setBaseline({
      todaySeconds: adopted.baselineTodaySeconds,
      totalSeconds: adopted.baselineTotalSeconds,
    });
    setBaselineDate(adopted.activityDate);
    setClock(now);
    setBlockedByOtherTab(false);
    if (adopted.status === "running") {
      sendSegment(
        adopted.context,
        adopted.segmentId,
        adopted.activityDate,
        currentSegmentSeconds(adopted, now),
        false,
      );
    }
  }, [commitSession, finalizeSegmentBestEffort, sendSegment]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    setReady(false);
    setBlockedByOtherTab(false);
    const now = Date.now();
    const restored = readStoredSession(defaultContextRef.current);

    if (restored) {
      void acquireActivityLease().then((lease) => {
        if (cancelled || !mountedRef.current) {
          lease?.release();
          return;
        }
        if (lease) {
          leaseRef.current = lease;
          adoptStoredSession(restored, now);
          setReady(true);
          return;
        }
        setBlockedByOtherTab(true);
        void getActivityStats(localDate(new Date(now)))
          .then((stats) => {
            if (cancelled) return;
            setBaseline(stats);
            setBaselineDate(localDate(new Date(now)));
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setReady(true); });
      });
      return () => {
        cancelled = true;
        mountedRef.current = false;
        releaseLease();
      };
    }

    void getActivityStats(localDate(new Date(now)))
      .then((stats) => {
        if (cancelled) return;
        setBaseline(stats);
        setBaselineDate(localDate(new Date(now)));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReady(true); });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      releaseLease();
    };
  }, [adoptStoredSession, releaseLease]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      const current = sessionRef.current;
      if (!current) return;
      reconcile(current, now);
    }, sessionStatus === "running" ? 1000 : 60_000);
    return () => window.clearInterval(interval);
  }, [reconcile, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "running") return;
    const heartbeat = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current || current.status !== "running") return;
      const now = Date.now();
      const next = reconcile(current, now);
      sendSegment(
        next.context,
        next.segmentId,
        next.activityDate,
        currentSegmentSeconds(next, now),
        false,
      );
    }, 30_000);
    return () => {
      window.clearInterval(heartbeat);
      const current = sessionRef.current;
      if (current?.status === "running") {
        const now = Date.now();
        sendSegment(
          current.context,
          current.segmentId,
          current.activityDate,
          currentSegmentSeconds(current, now),
          false,
        );
      }
    };
  }, [reconcile, sendSegment, sessionStatus]);

  function start(contextOverride?: ActivityStart) {
    if (!ready || sessionRef.current || leaseRef.current || acquiringLease.current) return;
    const context = contextOverride ?? defaultContextRef.current;
    if (!context?.title.trim()) return;

    acquiringLease.current = true;
    void acquireActivityLease().then((lease) => {
      acquiringLease.current = false;
      if (!lease || !mountedRef.current) {
        lease?.release();
        setBlockedByOtherTab(!lease);
        return;
      }
      leaseRef.current = lease;
      setBlockedByOtherTab(false);
      const now = Date.now();
      const stored = readStoredSession(defaultContextRef.current);
      if (stored) {
        adoptStoredSession(stored, now);
        return;
      }
      const date = localDate(new Date(now));
      const effectiveBaseline = {
        todaySeconds: baselineDate === date ? baseline.todaySeconds : 0,
        totalSeconds: baseline.totalSeconds,
      };
      const logicalSessionId = crypto.randomUUID();
      const next: ManualStudySession = {
        logicalSessionId,
        segmentId: studySegmentId(logicalSessionId, date),
        activityDate: date,
        status: "running",
        sessionAccumulatedSeconds: 0,
        segmentAccumulatedSeconds: 0,
        runningSince: now,
        baselineTodaySeconds: effectiveBaseline.todaySeconds,
        baselineTotalSeconds: effectiveBaseline.totalSeconds,
        context,
      };
      setBaseline(effectiveBaseline);
      setBaselineDate(date);
      setClock(now);
      commitSession(next);
      sendSegment(next.context, next.segmentId, next.activityDate, 0, false);
    });
  }

  const adoptLegacyWorkspace = useCallback((context: ActivityStart) => {
    if (
      !ready
      || !context.workspaceId
      || sessionRef.current
      || leaseRef.current
      || acquiringLease.current
    ) return;
    if (!readLocalStorage(legacyStorageKey(context.workspaceId))) return;

    acquiringLease.current = true;
    void acquireActivityLease().then((lease) => {
      acquiringLease.current = false;
      if (!lease || !mountedRef.current) {
        lease?.release();
        setBlockedByOtherTab(!lease);
        return;
      }
      leaseRef.current = lease;
      setBlockedByOtherTab(false);

      const now = Date.now();
      const stored = readStoredSession(context);
      if (!stored) {
        releaseLease();
        return;
      }
      adoptStoredSession(stored, now);
    });
  }, [adoptStoredSession, ready, releaseLease]);

  function pause() {
    const current = sessionRef.current;
    if (!current || current.status !== "running") return;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    const next = materializeStudySession(reconciled, now);
    commitSession(next);
    setClock(now);
    sendSegment(next.context, next.segmentId, next.activityDate, next.segmentAccumulatedSeconds, false);
  }

  function resume() {
    const current = sessionRef.current;
    if (!current || current.status !== "paused") return;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    const next = resumeStudySession(reconciled, now);
    commitSession(next);
    setClock(now);
    sendSegment(next.context, next.segmentId, next.activityDate, next.segmentAccumulatedSeconds, false);
  }

  function end() {
    const current = sessionRef.current;
    if (!current) return null;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    const finished = reconciled.status === "running"
      ? materializeStudySession(reconciled, now)
      : reconciled;
    const finalization = queueFinalization(
      finished.context,
      finished.segmentId,
      finished.activityDate,
      finished.segmentAccumulatedSeconds,
      finished.context?.taskId,
    );
    if (!finalization) {
      commitSession(finished);
      setClock(now);
      return null;
    }
    const nextBaseline = {
      todaySeconds: Math.max(0, finished.baselineTodaySeconds)
        + Math.max(0, finished.segmentAccumulatedSeconds),
      totalSeconds: Math.max(0, finished.baselineTotalSeconds)
        + Math.max(0, finished.sessionAccumulatedSeconds),
    };
    setBaseline(nextBaseline);
    setBaselineDate(finished.activityDate);
    setClock(now);
    commitSession(null);
    releaseLease();
    return finalization;
  }

  async function deleteSession(sessionId: string) {
    if (sessionRef.current || blockedByOtherTab) {
      throw new Error("End the active activity before deleting session history.");
    }
    await deleteActivitySession(sessionId);
    const now = Date.now();
    const date = localDate(new Date(now));
    const stats = await getActivityStats(date);
    setBaseline(stats);
    setBaselineDate(date);
    setClock(now);
  }

  const date = localDate(new Date(clock));
  const currentSeconds = session ? currentSessionSeconds(session, clock) : 0;
  const todayCurrentSeconds = session && session.activityDate === date
    ? currentSegmentSeconds(session, clock)
    : 0;
  const displayBaseline = session
    ? {
        todaySeconds: session.baselineTodaySeconds,
        totalSeconds: session.baselineTotalSeconds,
      }
    : {
        todaySeconds: baselineDate === date ? baseline.todaySeconds : 0,
        totalSeconds: baseline.totalSeconds,
      };
  const totals = combineStudyStats(
    displayBaseline,
    session ? todayCurrentSeconds : 0,
    currentSeconds,
  );

  return {
    workspaceId: session?.context?.workspaceId ?? defaultContext?.workspaceId ?? "",
    activeContext: session?.context,
    currentSeconds,
    todaySeconds: totals.todaySeconds,
    totalSeconds: totals.totalSeconds,
    status: sessionStatus,
    ready,
    canStart: ready && !session,
    blockedByOtherTab,
    start,
    pause,
    resume,
    end,
    adoptLegacyWorkspace,
    deleteSession,
  };
}

export function useStudySession(workspaceId: string, workspaceTitle: string): StudySessionState {
  return useActivitySession({
    title: workspaceTitle,
    activityType: "learn",
    workspaceId,
    workspaceTitleSnapshot: workspaceTitle,
  });
}
